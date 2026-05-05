const getApiUrl = () => {
  return "/api";
};

const API_URL = getApiUrl();

export const evaluateCandidate = async (data: any) => {
  const res = await fetch(`${API_URL}/evaluate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });

  if (!res.ok) {
    throw new Error(`Evaluation failed: ${res.statusText}`);
  }

  return res.json();
};

