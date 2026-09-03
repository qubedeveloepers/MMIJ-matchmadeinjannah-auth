import leoProfanity from 'leo-profanity';

export const RESERVED_USERNAMES = new Set([
  'admin',
  'administrator',
  'support',
  'moderator',
  'mod',
  'staff',
  'help',
  'root',
  'system',
  'null',
  'undefined',
  'anonymous',
  'bot',
  'mmij',
  'matchmadeinjannah',
]);

export function isUsernameReserved(username: string): boolean {
  return RESERVED_USERNAMES.has(username);
}

export function isUsernameProfane(username: string): boolean {
  if (leoProfanity.check(username)) return true;
  // leo-profanity uses word-boundary regex so "fuckcat" won't match "fuck".
  // For usernames (single tokens), also check if any bad word is a substring.
  const badWords: string[] = leoProfanity.list();
  return badWords.some((word) => username.includes(word));
}
