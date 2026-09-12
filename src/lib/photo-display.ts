import type { AuthUser } from './types';
import { isTestAccount } from './test-account';
export { isTestAccount as usesDemoPhotos } from './test-account';
export const DEMO_STUDENT_PHOTO = '/demo-avatars/student-teal.png';
export function displayedStudentPhoto(_user: Pick<AuthUser, 'email'>, photoUrl: string, cartoonUrl = '') {
  return cartoonUrl || (photoUrl ? DEMO_STUDENT_PHOTO : '');
}

/** Original photos are used only for matching; the demo login never receives them. */
export function recognitionStudentPhoto(user: Pick<AuthUser, 'email'>, photoUrl: string) {
  return isTestAccount(user) && photoUrl ? DEMO_STUDENT_PHOTO : photoUrl;
}
