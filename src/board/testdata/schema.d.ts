export interface ValidatedManifest {
  ok: boolean;
  app: string | null;
  generated_at: string | null;
  tiles: Array<{ id: string; tone: string; form?: string; sizes: string[]; size: string; name: string; show: boolean; href?: string; accent?: { h: number; s: number }; data: Record<string, unknown> }>;
  errors: Array<{ id: string | null; message: string }>;
}
export function validateManifest(manifest: unknown, policy: { imageOrigins: readonly string[]; linkOrigins: readonly string[] }): ValidatedManifest;
