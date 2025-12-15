import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

// Load NXML files from GraphStudio panels directory
const panelsDir = path.join(__dirname, '../../../apps/GraphStudio/src/panels/nxml');

const notesNXML = fs.readFileSync(path.join(panelsDir, 'notes.nxml'), 'utf-8');
const chatNXML = fs.readFileSync(path.join(panelsDir, 'chat.nxml'), 'utf-8');

async function seed() {
  console.log('🌱 Seeding database...');

  // Create Nexus official user
  const hashedPassword = await bcrypt.hash('nexus-official', 10);

  const nexusUser = await prisma.user.upsert({
    where: { email: 'nexus@official.com' },
    create: {
      email: 'nexus@official.com',
      hashedPassword,
      fullName: 'Nexus Team',
      isActive: true,
    },
    update: {},
  });

  console.log(`✅ Created Nexus official user: ${nexusUser.email}`);

  // Seed Notes panel
  const notesPanel = await prisma.panel.upsert({
    where: { id: 'nexus-notes' },
    create: {
      id: 'nexus-notes',
      name: 'Notes',
      description: 'Simple note-taking panel with filtering',
      category: 'data',
      icon: 'StickyNote',
      accentColor: 'amber',
      nxmlSource: notesNXML,
      hasCustomComponents: false,
      authorId: nexusUser.id,
      version: '1.0.0',
      type: 'nexus',
      visibility: 'published',
      tags: 'notes,productivity,text',
      installCount: 0,
    },
    update: {},
  });

  // Create first version for Notes
  await prisma.panelVersion.upsert({
    where: {
      panelId_version: {
        panelId: notesPanel.id,
        version: '1.0.0',
      },
    },
    create: {
      panelId: notesPanel.id,
      version: '1.0.0',
      nxmlSource: notesNXML,
      changelog: 'Initial version',
    },
    update: {},
  });

  console.log(`✅ Created Notes panel: ${notesPanel.name}`);

  // Seed Chat panel
  const chatPanel = await prisma.panel.upsert({
    where: { id: 'nexus-chat' },
    create: {
      id: 'nexus-chat',
      name: 'AI Chat',
      description: 'Chat with AI assistant',
      category: 'ai',
      icon: 'MessageSquare',
      accentColor: 'violet',
      nxmlSource: chatNXML,
      hasCustomComponents: false,
      authorId: nexusUser.id,
      version: '1.0.0',
      type: 'nexus',
      visibility: 'published',
      tags: 'ai,chat,assistant',
      installCount: 0,
    },
    update: {},
  });

  // Create first version for Chat
  await prisma.panelVersion.upsert({
    where: {
      panelId_version: {
        panelId: chatPanel.id,
        version: '1.0.0',
      },
    },
    create: {
      panelId: chatPanel.id,
      version: '1.0.0',
      nxmlSource: chatNXML,
      changelog: 'Initial version',
    },
    update: {},
  });

  console.log(`✅ Created Chat panel: ${chatPanel.name}`);

  console.log('🎉 Seeding completed successfully!');
}

seed()
  .catch((error) => {
    console.error('❌ Seeding failed:');
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
