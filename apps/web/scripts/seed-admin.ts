import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const adminEmails = (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((e) => e.trim())
    .filter(Boolean);

  if (adminEmails.length === 0) {
    console.log("No ADMIN_EMAILS configured. Set ADMIN_EMAILS in .env");
    console.log("Example: ADMIN_EMAILS=admin@example.com,admin2@example.com");
    return;
  }

  for (const email of adminEmails) {
    const result = await prisma.user.updateMany({
      where: { email },
      data: { role: "ADMIN" },
    });

    if (result.count > 0) {
      console.log(`Promoted ${email} to ADMIN`);
    } else {
      console.log(`User not found: ${email}`);
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
