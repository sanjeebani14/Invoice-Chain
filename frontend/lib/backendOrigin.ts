export const getBackendOrigin = (): string => {
  const envOrigin = process.env.NEXT_PUBLIC_API_ORIGIN?.trim();
  if (envOrigin) {
    return envOrigin.replace(/\/$/, "");
  }

  if (typeof window !== "undefined") {
    const host = window.location.hostname || "localhost";
    return `http://${host}:8000`;
  }

  return "http://localhost:8000";
};
