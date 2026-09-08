import type { AuthUser } from './types';
import { isTestAccount } from './test-account';
export { isTestAccount as usesDemoPhotos } from './test-account';
export const DEMO_STUDENT_PHOTO = '/demo-avatars/student-teal.png';
export function displayedStudentPhoto(user: Pick<AuthUser, 'email'>, photoUrl: string) {
  return isTestAccount(user) ? DEMO_STUDENT_PHOTO : photoUrl;
}
