import { describe, expect, it } from "vitest";
import { composeGridImage } from "../src/utils/imageGrid.ts";

describe("composeGridImage", () => {
  it("添付ファイルが0枚でも空キャンバスのAttachmentBuilderを返す", async () => {
    await expect(composeGridImage([])).resolves.toBeDefined();
  });
});
