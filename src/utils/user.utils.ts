export function stripPassword(user: any) {
  const { password, ...userWithoutPassword } = user.toObject();
  return userWithoutPassword;
}
