const BACKEND_URL =
  import.meta.env.VITE_BACKEND_URL || "http://localhost:3333";

export async function uploadEncryptedToIPFS(encryptedContent) {
  const formData = new FormData();

  const blob = new Blob([encryptedContent], {
    type: "text/plain",
  });

  const file = new File([blob], "encrypted-file.dat");

  formData.append("file", file);

  const res = await fetch(`${BACKEND_URL}/upload`, {
    method: "POST",
    body: formData,
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.error || data.msg || "Upload failed");
  }

  return data.cid;
}