// Simple API layer — placeholder for backend integration
// Replace with real axios calls when backend is ready

export async function uploadTableFile(file: File, platform: string): Promise<{ success: boolean; path: string; rows: number }> {
  // Simulate file upload to default app folder
  const storedPath = `/app/uploads/${platform}/${file.name}`;
  return {
    success: true,
    path: storedPath,
    rows: Math.floor(Math.random() * 500) + 50,
  };
}
