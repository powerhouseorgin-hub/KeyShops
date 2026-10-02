// The two roles in the system. They travel in the Firebase Auth custom claims ({ role, shopId }) and are
// checked by RolesGuard against the @Roles(...) metadata on each controller. The string values are what is
// stored in claims and in the Firestore `users` documents - do not rename them.
export enum Role {
  SUPER_ADMIN = 'SUPER_ADMIN',
  SHOP_ADMIN = 'SHOP_ADMIN',
}
