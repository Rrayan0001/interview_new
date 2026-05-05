const getApiUrl = () => {
  return "/api";
};

const API_URL = getApiUrl();

export const uploadResume = async (file: File, cleanup: boolean = true) => {
  const form = new FormData();
  form.append("file", file);

  const res = await fetch(`${API_URL}/upload-resume?cleanup=${cleanup}`, {
    method: "POST",
    body: form,
  });

  if (!res.ok) {
    throw new Error(`Upload failed: ${res.statusText}`);
  }

  return res.json();
};

