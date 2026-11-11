import { clerkSetup } from "@clerk/testing/playwright";
import { createClerkClient } from "@clerk/backend";
import { E2E_USER } from "./helpers/constants";

/**
 * 1. `clerkSetup()` lấy Testing Token từ Clerk Backend API và đặt vào process.env
 *    (CLERK_TESTING_TOKEN) → các worker kế thừa, `setupClerkTestingToken()` dùng nó để
 *    vượt bot protection của Clerk thay vì phải bypass middleware.
 * 2. Đảm bảo user test tồn tại trên Clerk dev instance (sign-in ticket cần user có sẵn).
 */
export default async function globalSetup() {
  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!secretKey?.startsWith("sk_test_")) {
    throw new Error("E2E cần CLERK_SECRET_KEY của Clerk *development* instance (sk_test_…).");
  }

  await clerkSetup();

  const clerk = createClerkClient({ secretKey });
  const { data } = await clerk.users.getUserList({ emailAddress: [E2E_USER.email] });
  if (data.length === 0) {
    await clerk.users.createUser({
      emailAddress: [E2E_USER.email],
      password: E2E_USER.password,
      firstName: "E2E",
      lastName: "Tester",
      skipPasswordChecks: true,
    });
  }
}
