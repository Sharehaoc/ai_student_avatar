const SIGNATURES: Record<string, (bytes: Uint8Array) => boolean> = {
  "image/jpeg": (bytes) => bytes.length >= 3
    && bytes[0] === 0xff
    && bytes[1] === 0xd8
    && bytes[2] === 0xff,
  "image/png": (bytes) => bytes.length >= 8
    && [137, 80, 78, 71, 13, 10, 26, 10].every(
      (value, index) => bytes[index] === value,
    ),
  "image/webp": (bytes) => bytes.length >= 12
    && [82, 73, 70, 70].every((value, index) => bytes[index] === value)
    && [87, 69, 66, 80].every((value, index) => bytes[index + 8] === value),
};

export class InvalidAvatarFileError extends Error {
  constructor() {
    super("頭像檔案內容與格式不符");
    this.name = "InvalidAvatarFileError";
  }
}

export async function validateAvatarFile(file: File): Promise<void> {
  const matches = SIGNATURES[file.type];
  if (!matches) throw new InvalidAvatarFileError();
  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  if (!matches(bytes)) throw new InvalidAvatarFileError();
}
