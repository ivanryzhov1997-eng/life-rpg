export const Session = {
  cookieName: "life_rpg_sid",
  maxAgeMs: 365 * 24 * 60 * 60 * 1000,
} as const;

export const ErrorMessages = {
  unauthenticated: "Anonymous session required",
  insufficientRole: "Insufficient permissions",
} as const;
