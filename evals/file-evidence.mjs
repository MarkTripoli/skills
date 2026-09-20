export function permissionMode(stats) {
  return (stats.mode & 0o7777).toString(8).padStart(4, "0");
}

export function fileReadError(stats, error) {
  let errorClass = "read-failure";
  if (error?.code === "EACCES" || error?.code === "EPERM") errorClass = "permission-denied";
  else if (error?.code === "EIO") errorClass = "io-error";
  return {
    kind: "file-error",
    mode: permissionMode(stats),
    operation: "read-file",
    errorClass,
    sha256: null,
  };
}
