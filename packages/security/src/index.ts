export function assertRelativeSafePath(path: string) {
  if (path.startsWith("/") || path.includes("..")) {
    throw new Error("Path must stay inside its configured root");
  }
}
