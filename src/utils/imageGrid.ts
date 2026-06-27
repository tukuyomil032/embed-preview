import { AttachmentBuilder, type Attachment } from "discord.js";
import sharp from "sharp";

const TILE = 320;
const GRID_SIZE = TILE * 2; // 640x640

export async function composeGridImage(attachments: Attachment[]): Promise<AttachmentBuilder> {
  const tiles = attachments.slice(0, 4);

  const imageBuffers: { buffer: Buffer; width: number; height: number }[] = [];
  for (const att of tiles) {
    try {
      const res = await fetch(att.url);
      if (!res.ok) {
        console.warn(`[imageGrid] Failed to download image (${res.status}): ${att.url}`);
        continue;
      }
      const arrayBuffer = await res.arrayBuffer();
      const raw = Buffer.from(arrayBuffer);
      const resized = await sharp(raw)
        .resize(TILE, TILE, { fit: "inside" })
        .png()
        .toBuffer({ resolveWithObject: true });
      imageBuffers.push({
        buffer: resized.data,
        width: resized.info.width,
        height: resized.info.height,
      });
    } catch (err) {
      console.warn(`[imageGrid] Skipping image tile (${att.url}):`, err);
    }
  }

  const positions = [
    { left: 0, top: 0 },
    { left: TILE, top: 0 },
    { left: 0, top: TILE },
    { left: TILE, top: TILE },
  ] as const;

  const composites: sharp.OverlayOptions[] = imageBuffers.map((img, i) => {
    const pos = positions[i] ?? { left: 0, top: 0 };
    return {
      input: img.buffer,
      left: pos.left + Math.floor((TILE - img.width) / 2),
      top: pos.top + Math.floor((TILE - img.height) / 2),
    };
  });

  const outputBuffer = await sharp({
    create: {
      width: GRID_SIZE,
      height: GRID_SIZE,
      channels: 4,
      background: { r: 54, g: 57, b: 63, alpha: 1 },
    },
  })
    .composite(composites)
    .png()
    .toBuffer();

  return new AttachmentBuilder(outputBuffer, { name: "grid.png" });
}
