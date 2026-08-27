import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding database...");

  // 1. Create or find Class 10
  let cls = await prisma.class.findFirst({
    where: { name: "Class 10" },
  });

  if (!cls) {
    cls = await prisma.class.create({
      data: { name: "Class 10" },
    });
    console.log(`Created Class: ${cls.name} (${cls.id})`);
  } else {
    console.log(`Found existing Class: ${cls.name} (${cls.id})`);
  }

  // 2. Create or find Subject Caru o Karukola / Caru o karu
  let subject = await prisma.subject.findFirst({
    where: {
      classId: cls.id,
      name: { in: ["Caru o Karukola", "Caru o karu", "চারু ও কারুকলা"] },
    },
  });

  if (!subject) {
    subject = await prisma.subject.create({
      data: {
        classId: cls.id,
        name: "Caru o Karukola",
      },
    });
    console.log(`Created Subject: ${subject.name} (${subject.id})`);
  } else {
    console.log(`Found existing Subject: ${subject.name} (${subject.id})`);
  }

  // 3. Create or find Chapter Shilpo Kola
  let chapter = await prisma.chapter.findFirst({
    where: {
      subjectId: subject.id,
      name: { in: ["Shilpo Kola", "Shilpokola", "শিল্পকলা"] },
    },
  });

  if (!chapter) {
    chapter = await prisma.chapter.create({
      data: {
        subjectId: subject.id,
        name: "Shilpo Kola",
        order: 1,
      },
    });
    console.log(`Created Chapter: ${chapter.name} (${chapter.id})`);
  } else {
    console.log(`Found existing Chapter: ${chapter.name} (${chapter.id})`);
  }

  console.log("Seeding complete!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
