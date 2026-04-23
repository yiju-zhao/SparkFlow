type FsFileEntry = {
  isFile: true;
  isDirectory: false;
  name: string;
  fullPath: string;
  file: (cb: (f: File) => void, err?: (e: unknown) => void) => void;
};

type FsDirectoryEntry = {
  isFile: false;
  isDirectory: true;
  name: string;
  fullPath: string;
  createReader: () => {
    readEntries: (
      cb: (entries: Array<FsFileEntry | FsDirectoryEntry>) => void,
      err?: (e: unknown) => void,
    ) => void;
  };
};

type FsEntry = FsFileEntry | FsDirectoryEntry;

function readEntriesAll(dir: FsDirectoryEntry): Promise<FsEntry[]> {
  return new Promise((resolve, reject) => {
    const reader = dir.createReader();
    const collected: FsEntry[] = [];
    const readBatch = () => {
      reader.readEntries((entries) => {
        if (entries.length === 0) {
          resolve(collected);
          return;
        }
        collected.push(...entries);
        readBatch();
      }, reject);
    };
    readBatch();
  });
}

async function walkEntry(entry: FsEntry): Promise<File[]> {
  if (entry.isFile) {
    return new Promise<File[]>((resolve, reject) => {
      entry.file((file) => resolve([file]), reject);
    });
  }
  const children = await readEntriesAll(entry);
  const nested = await Promise.all(children.map(walkEntry));
  return nested.flat();
}

export async function collectFilesFromDataTransfer(dt: DataTransfer): Promise<File[]> {
  if (dt.items && dt.items.length > 0 && typeof dt.items[0].webkitGetAsEntry === "function") {
    const entries: FsEntry[] = [];
    for (let i = 0; i < dt.items.length; i++) {
      const entry = dt.items[i].webkitGetAsEntry() as FsEntry | null;
      if (entry) entries.push(entry);
    }
    const nested = await Promise.all(entries.map(walkEntry));
    return nested.flat();
  }
  return Array.from(dt.files ?? []);
}
