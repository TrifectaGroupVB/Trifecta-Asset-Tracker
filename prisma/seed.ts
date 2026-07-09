import { readFile } from "node:fs/promises";
import path from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { put } from "@vercel/blob";
import { PrismaClient } from "../src/generated/prisma/client";
import { generateTagCode } from "../src/lib/tags";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set — add your Postgres connection string to .env");
}
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const CONTENT_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".pdf": "application/pdf",
};

// Seed assets live in /public/uploads. When a Blob token is present
// (seeding a production DB), upload each asset to Vercel Blob and seed
// the Blob URL instead of the local path.
async function assetUrl(localUrl: string): Promise<string> {
  if (!process.env.BLOB_READ_WRITE_TOKEN) return localUrl;
  const rel = localUrl.replace(/^\//, ""); // uploads/equipment/…
  const buffer = await readFile(path.join(process.cwd(), "public", rel));
  const blob = await put(rel.replace(/^uploads\//, ""), buffer, {
    access: "public",
    contentType: CONTENT_TYPES[path.extname(rel)] ?? "application/octet-stream",
    allowOverwrite: true,
  });
  console.log(`  uploaded ${rel} → Blob`);
  return blob.url;
}

async function main() {
  // Wipe in dependency order so the seed is re-runnable.
  await prisma.partOrderLine.deleteMany();
  await prisma.partOrder.deleteMany();
  await prisma.serviceRecord.deleteMany();
  await prisma.serviceRequest.deleteMany();
  await prisma.tag.deleteMany();
  await prisma.tagBatch.deleteMany();
  await prisma.specField.deleteMany();
  await prisma.manualFile.deleteMany();
  await prisma.part.deleteMany();
  await prisma.equipment.deleteMany();
  await prisma.tech.deleteMany();
  await prisma.setting.deleteMany();
  await prisma.location.deleteMany();

  // This seed only builds out demo data for the pilot location — Chix and
  // The Shack start empty and get their real equipment added via the tag
  // wizard / admin, same as Waterman's did.
  const watermans = await prisma.location.create({
    data: {
      slug: "watermans",
      name: "Waterman's Surfside Grille",
      address: "415 Atlantic Ave, Virginia Beach, VA 23451",
      logoUrl: "/brand/watermans-logo-full.png",
    },
  });
  await prisma.location.create({
    data: {
      slug: "chix",
      name: "Chix on the Beach",
      address: "701 Atlantic Ave, Virginia Beach, VA 23451",
      logoUrl: "/brand/chix-logo-full.png",
    },
  });
  await prisma.location.create({
    data: {
      slug: "shack",
      name: "The Shack on 8th",
      address: "715 Atlantic Ave, Virginia Beach, VA 23451",
      logoUrl: "/brand/shack-logo-full.png",
    },
  });

  const walkIn = await prisma.equipment.create({
    data: {
      restaurantId: watermans.id,
      name: "Walk-In Cooler",
      manufacturer: "Kolpak",
      model: "KF7-0810-CR",
      serial: "KP-2214-88317",
      location: "Back of house — prep line",
      photoUrl: await assetUrl("/uploads/equipment/walk-in-cooler.jpg"),
      installDate: new Date("2022-03-15"),
      warrantyExpires: new Date("2027-03-15"),
      notes:
        "Compressor replaced under warranty Nov 2023. Door hinge sticks in humid weather.",
      specFields: {
        create: [
          { label: "Voltage", value: "208-230V / 1PH / 60Hz" },
          { label: "Refrigerant", value: "R-448A" },
          { label: "Charge", value: "3 lb 4 oz" },
          { label: "Temp Range", value: "35–38 °F" },
          { label: "Compressor", value: "1.5 HP Copeland" },
        ],
      },
      parts: {
        create: [
          { name: "Evaporator Fan Motor", partNumber: "5024F", price: 189.5 },
          { name: "Door Gasket 36 × 78", partNumber: "22679-1075", price: 84.0 },
          { name: "Digital Temp Controller", partNumber: "29027-3010", price: 212.75 },
          { name: "Condenser Fan Blade", partNumber: "5063F", price: null },
        ],
      },
      manuals: {
        create: [
          {
            title: "Kolpak Installation & Service Manual",
            fileUrl: await assetUrl("/uploads/manuals/kolpak-kf7-service-manual.pdf"),
          },
        ],
      },
    },
  });

  const fryer = await prisma.equipment.create({
    data: {
      restaurantId: watermans.id,
      name: "Gas Fryer",
      manufacturer: "Frymaster",
      model: "MJ45",
      serial: "1712MA0045T",
      location: "Cook line — station 2",
      installDate: new Date("2019-08-02"),
      warrantyExpires: new Date("2021-08-02"),
      notes: "Right burner slow to light — orifices cleaned Apr 2026.",
      specFields: {
        create: [
          { label: "Gas Type", value: "Natural Gas" },
          { label: "Input", value: "122,000 BTU/hr" },
          { label: "Oil Capacity", value: "40–50 lb" },
          { label: "Ignition", value: "Standing pilot" },
        ],
      },
      parts: {
        create: [
          { name: "Thermopile", partNumber: "8100162", price: 24.99 },
          { name: "High-Limit Thermostat", partNumber: "8073482", price: 67.5 },
          { name: "Gas Combination Valve", partNumber: "8262871", price: 148.0 },
          { name: "Twin Fry Basket", partNumber: "8030355", price: 42.25 },
        ],
      },
      manuals: {
        create: [
          {
            title: "Frymaster MJ45 Service & Parts Manual",
            fileUrl: await assetUrl("/uploads/manuals/frymaster-mj45-service-manual.pdf"),
          },
        ],
      },
    },
  });

  const oven = await prisma.equipment.create({
    data: {
      restaurantId: watermans.id,
      name: "Convection Oven",
      manufacturer: "Blodgett",
      model: "DFG-100",
      serial: "091018XM0231",
      location: "Cook line — station 4",
      installDate: new Date("2020-11-20"),
      warrantyExpires: new Date("2022-11-20"),
      specFields: {
        create: [
          { label: "Gas Input", value: "55,000 BTU/hr" },
          { label: "Electrical", value: "115V / 1PH / 60Hz" },
          { label: "Blower", value: "1/2 HP, two-speed" },
          { label: "Doors", value: "Dual pane glass" },
        ],
      },
      parts: {
        create: [
          { name: "Door Gasket", partNumber: "R3-3902", price: 58.0 },
          { name: "Blower Motor", partNumber: "32261", price: 385.0 },
          { name: "Spark Igniter", partNumber: "33513", price: 47.8 },
        ],
      },
      manuals: {
        create: [
          {
            title: "Blodgett DFG-100 Installation & Operation Manual",
            fileUrl: await assetUrl("/uploads/manuals/blodgett-dfg-100-manual.pdf"),
          },
        ],
      },
    },
  });

  const dana = await prisma.tech.create({
    data: {
      name: "Dana Whitfield",
      email: "dana@whitfieldrefrigeration.com",
      phone: "757-555-0117",
    },
  });

  await prisma.tech.create({
    data: {
      name: "Mike Rivera",
      email: "mrivera@coastalkitchentech.com",
      phone: "757-555-0143",
    },
  });

  await prisma.serviceRequest.create({
    data: {
      requestNumber: 1,
      equipmentId: walkIn.id,
      requesterName: "Carlos M. (AM prep)",
      description:
        "Cooler reading 48°F at 7am, product going soft. Compressor runs constantly but isn't cooling.",
      urgency: "URGENT",
      status: "ASSIGNED",
      techId: dana.id,
      events: {
        create: [
          { kind: "STATUS", text: "Assigned to Dana Whitfield" },
          { kind: "NOTE", text: "Called Dana 7:40am — on site before lunch rush." },
        ],
      },
    },
  });

  await prisma.serviceRequest.create({
    data: {
      requestNumber: 2,
      equipmentId: fryer.id,
      requesterName: "Jen (PM line)",
      description:
        "Pilot won't stay lit on the right vat. Relighting it every hour during service.",
      urgency: "NORMAL",
      status: "OPEN",
    },
  });

  await prisma.serviceRecord.createMany({
    data: [
      {
        equipmentId: walkIn.id,
        date: new Date("2023-11-08"),
        techName: "Dana Whitfield",
        workPerformed:
          "Replaced failed compressor under warranty. Pulled vacuum, recharged, verified 36°F holding overnight.",
        partsUsed: "Copeland compressor M4FH-A025, filter drier",
      },
      {
        equipmentId: fryer.id,
        date: new Date("2026-04-12"),
        techName: "Mike Rivera",
        workPerformed:
          "Cleaned burner orifices and flue, adjusted pilot. Right burner lighting normally again.",
      },
    ],
  });

  // One printed batch of 10 tags: 3 on equipment, 1 as a service-request
  // station, 6 still unassigned.
  const batch = await prisma.tagBatch.create({
    data: { batchNumber: 1, count: 10, restaurantId: watermans.id },
  });

  const taken = new Set<string>();
  const assignedAt = new Date();

  for (const eq of [walkIn, fryer, oven]) {
    await prisma.tag.create({
      data: {
        code: generateTagCode(taken),
        role: "EQUIPMENT",
        equipmentId: eq.id,
        batchId: batch.id,
        assignedAt,
      },
    });
  }

  await prisma.tag.create({
    data: {
      code: generateTagCode(taken),
      role: "SERVICE_REQUEST",
      label: "Front kitchen wall",
      batchId: batch.id,
      assignedAt,
    },
  });

  for (let i = 0; i < 6; i++) {
    await prisma.tag.create({
      data: { code: generateTagCode(taken), batchId: batch.id },
    });
  }

  await prisma.setting.createMany({
    data: [
      { key: "adminEmail", value: "parker0125@gmail.com" },
      { key: "dashboardPin", value: "417293" },
    ],
  });

  const counts = {
    equipment: await prisma.equipment.count(),
    parts: await prisma.part.count(),
    techs: await prisma.tech.count(),
    serviceRequests: await prisma.serviceRequest.count(),
    tags: await prisma.tag.count(),
  };
  console.log("Seed complete:", counts);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
