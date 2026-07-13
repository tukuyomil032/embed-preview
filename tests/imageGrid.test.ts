import { AttachmentBuilder, type Attachment } from "discord.js";
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { composeGridImage } from "../src/utils/imageGrid.ts";

type TileSize = { width: number; height: number };

vi.mock("sharp", () => {
  let nextTileSizes: TileSize[] = [];
  const canvasInstance = {
    composite: vi.fn(() => canvasInstance),
    png: vi.fn(() => canvasInstance),
    toBuffer: vi.fn(() => Promise.resolve(Buffer.from("grid-output"))),
  };
  const makeTileInstance = () => {
    const size = nextTileSizes.shift() ?? { width: 320, height: 320 };
    const tileInstance = {
      resize: vi.fn(() => tileInstance),
      png: vi.fn(() => tileInstance),
      toBuffer: vi.fn(() => Promise.resolve({ data: Buffer.from("tile"), info: size })),
    };
    return tileInstance;
  };
  const sharpFn = vi.fn((arg: unknown) => {
    if (arg && typeof arg === "object" && "create" in arg) return canvasInstance;
    return makeTileInstance();
  });
  return {
    default: Object.assign(sharpFn, {
      __setNextTileSizes: (sizes: TileSize[]) => {
        nextTileSizes = sizes;
      },
      __canvasInstance: canvasInstance,
    }),
  };
});

type SharpMock = typeof sharp & {
  __setNextTileSizes: (sizes: TileSize[]) => void;
  __canvasInstance: { composite: ReturnType<typeof vi.fn> };
};

const sharpMock = sharp as unknown as SharpMock;

function makeAttachment(url: string): Attachment {
  return { url } as unknown as Attachment;
}

function mockFetchOk(): Response {
  return {
    ok: true,
    arrayBuffer: () => Promise.resolve(new ArrayBuffer(4)),
  } as unknown as Response;
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
  sharpMock.__setNextTileSizes([]);
  sharpMock.__canvasInstance.composite.mockClear();
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("composeGridImage", () => {
  it("添付ファイルが0枚でも空キャンバスのAttachmentBuilderを返す", async () => {
    await expect(composeGridImage([])).resolves.toBeDefined();
  });

  it("添付1枚: fetch成功・sharp成功でセンタリング計算通りに合成される", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(mockFetchOk());

    const result = await composeGridImage([makeAttachment("https://cdn.example.com/a.png")]);

    expect(result).toBeInstanceOf(AttachmentBuilder);
    expect(sharpMock.__canvasInstance.composite).toHaveBeenCalledWith([
      { input: expect.any(Buffer), left: 0, top: 0 },
    ]);
  });

  it("添付2〜4枚: 各タイルの座標が2x2グリッドの位置に割り当てられる", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(mockFetchOk())
      .mockResolvedValueOnce(mockFetchOk())
      .mockResolvedValueOnce(mockFetchOk())
      .mockResolvedValueOnce(mockFetchOk());

    await composeGridImage([
      makeAttachment("https://cdn.example.com/1.png"),
      makeAttachment("https://cdn.example.com/2.png"),
      makeAttachment("https://cdn.example.com/3.png"),
      makeAttachment("https://cdn.example.com/4.png"),
    ]);

    expect(sharpMock.__canvasInstance.composite).toHaveBeenCalledWith([
      { input: expect.any(Buffer), left: 0, top: 0 },
      { input: expect.any(Buffer), left: 320, top: 0 },
      { input: expect.any(Buffer), left: 0, top: 320 },
      { input: expect.any(Buffer), left: 320, top: 320 },
    ]);
  });

  it("添付5枚以上は先頭4枚のみfetchされる", async () => {
    vi.mocked(fetch).mockResolvedValue(mockFetchOk());

    await composeGridImage([
      makeAttachment("https://cdn.example.com/1.png"),
      makeAttachment("https://cdn.example.com/2.png"),
      makeAttachment("https://cdn.example.com/3.png"),
      makeAttachment("https://cdn.example.com/4.png"),
      makeAttachment("https://cdn.example.com/5.png"),
    ]);

    expect(fetch).toHaveBeenCalledTimes(4);
  });

  it("fetchが失敗（res.ok=false）したタイルはスキップされ、他の添付は正常処理される", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce({ ok: false, status: 404 } as unknown as Response)
      .mockResolvedValueOnce(mockFetchOk());

    await composeGridImage([
      makeAttachment("https://cdn.example.com/missing.png"),
      makeAttachment("https://cdn.example.com/ok.png"),
    ]);

    expect(sharpMock.__canvasInstance.composite).toHaveBeenCalledWith([
      { input: expect.any(Buffer), left: 0, top: 0 },
    ]);
  });

  it("fetch自体が例外をthrowした場合もスキップされ処理が継続する", async () => {
    vi.mocked(fetch)
      .mockRejectedValueOnce(new Error("network error"))
      .mockResolvedValueOnce(mockFetchOk());

    const result = await composeGridImage([
      makeAttachment("https://cdn.example.com/broken.png"),
      makeAttachment("https://cdn.example.com/ok.png"),
    ]);

    expect(result).toBeInstanceOf(AttachmentBuilder);
    expect(sharpMock.__canvasInstance.composite).toHaveBeenCalledWith([
      { input: expect.any(Buffer), left: 0, top: 0 },
    ]);
  });

  it("全ての添付が失敗しても例外を投げずAttachmentBuilderを返す", async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false, status: 500 } as unknown as Response);

    const result = await composeGridImage([
      makeAttachment("https://cdn.example.com/1.png"),
      makeAttachment("https://cdn.example.com/2.png"),
    ]);

    expect(result).toBeInstanceOf(AttachmentBuilder);
    expect(sharpMock.__canvasInstance.composite).toHaveBeenCalledWith([]);
  });
});
