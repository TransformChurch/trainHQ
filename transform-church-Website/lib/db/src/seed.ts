/**
 * Seed script — safe to run multiple times (idempotent).
 * Usage: npm run db:seed
 */
import { drizzle } from "drizzle-orm/node-postgres";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import pg from "pg";
import { tracksTable, modulesTable, videosTable, quizQuestionsTable, settingsTable } from "./schema";
import { eq } from "drizzle-orm";

const rootEnvFile = [resolve(process.cwd(), "../../.env"), resolve(process.cwd(), ".env")]
  .find(existsSync);
if (rootEnvFile) process.loadEnvFile(rootEnvFile);

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL must be set");
}

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool);

const TRACKS = [
  { name: "Overall Leadership", description: "Foundational leadership principles for serving and leading with excellence in any ministry context." },
  { name: "Youth Ministry", description: "Equipping leaders to shepherd, disciple, and connect with the next generation." },
  { name: "Kids Ministry", description: "Training for those called to create safe, fun, and faith-filled environments for children." },
];

const MODULES: Array<{ trackName: string; title: string; description: string; order: number }> = [
  { trackName: "Overall Leadership", title: "The Heart of a Leader", description: "Discover what it means to lead with servant-heartedness and integrity.", order: 1 },
  { trackName: "Overall Leadership", title: "Vision Casting & Communication", description: "Learn how to articulate vision and inspire others toward a common goal.", order: 2 },
  { trackName: "Overall Leadership", title: "Building Healthy Teams", description: "Principles for recruiting, developing, and empowering your team.", order: 3 },
  { trackName: "Youth Ministry", title: "Understanding Gen Z", description: "Deep dive into the culture, values, and challenges of today's youth.", order: 1 },
  { trackName: "Youth Ministry", title: "Discipleship in the Digital Age", description: "Practical strategies for discipling teenagers in a connected world.", order: 2 },
  { trackName: "Youth Ministry", title: "Parent Partnership", description: "How to engage and partner with parents to strengthen family faith.", order: 3 },
  { trackName: "Kids Ministry", title: "Creating Safe Environments", description: "Safety policies, background checks, and best practices for children's ministry.", order: 1 },
  { trackName: "Kids Ministry", title: "Teaching Children Effectively", description: "Age-appropriate teaching methods and curriculum development.", order: 2 },
  { trackName: "Kids Ministry", title: "Volunteer Development", description: "How to recruit, train, and retain great kids ministry volunteers.", order: 3 },
];

const VIDEOS: Array<{ moduleTitle: string; title: string; description: string; url: string; durationSeconds: number; order: number }> = [
  { moduleTitle: "The Heart of a Leader", title: "Why Servant Leadership Works", description: "Jesus modeled a radical form of leadership that changed everything.", url: "https://www.youtube.com/embed/dQw4w9WgXcQ", durationSeconds: 720, order: 1 },
  { moduleTitle: "The Heart of a Leader", title: "Integrity in Leadership", description: "What integrity looks like day-to-day in ministry leadership.", url: "https://www.youtube.com/embed/dQw4w9WgXcQ", durationSeconds: 840, order: 2 },
  { moduleTitle: "The Heart of a Leader", title: "Leading from Strength, Not Fear", description: "Healthy leaders lead from identity, not insecurity.", url: "https://www.youtube.com/embed/dQw4w9WgXcQ", durationSeconds: 600, order: 3 },
  { moduleTitle: "Vision Casting & Communication", title: "What is Vision?", description: "Understanding the nature and power of vision in ministry.", url: "https://www.youtube.com/embed/dQw4w9WgXcQ", durationSeconds: 660, order: 1 },
  { moduleTitle: "Vision Casting & Communication", title: "How to Communicate Vision", description: "Practical tools for sharing vision in compelling ways.", url: "https://www.youtube.com/embed/dQw4w9WgXcQ", durationSeconds: 780, order: 2 },
  { moduleTitle: "Understanding Gen Z", title: "Who is Gen Z?", description: "Demographics, values, and worldview of today's teenagers.", url: "https://www.youtube.com/embed/dQw4w9WgXcQ", durationSeconds: 900, order: 1 },
  { moduleTitle: "Understanding Gen Z", title: "Meeting Students Where They Are", description: "Practical strategies for connecting with young people authentically.", url: "https://www.youtube.com/embed/dQw4w9WgXcQ", durationSeconds: 720, order: 2 },
  { moduleTitle: "Creating Safe Environments", title: "Safety Protocols for Kids Ministry", description: "Essential policies every kids ministry leader must know.", url: "https://www.youtube.com/embed/dQw4w9WgXcQ", durationSeconds: 1080, order: 1 },
  { moduleTitle: "Creating Safe Environments", title: "Background Check Process", description: "Understanding volunteer screening and its importance.", url: "https://www.youtube.com/embed/dQw4w9WgXcQ", durationSeconds: 540, order: 2 },
  { moduleTitle: "Teaching Children Effectively", title: "Learning Styles in Children", description: "How kids learn and how to teach to every learner.", url: "https://www.youtube.com/embed/dQw4w9WgXcQ", durationSeconds: 840, order: 1 },
  { moduleTitle: "Teaching Children Effectively", title: "Making the Bible Come Alive", description: "Storytelling, object lessons, and engagement techniques.", url: "https://www.youtube.com/embed/dQw4w9WgXcQ", durationSeconds: 780, order: 2 },
];

const QUIZ_QUESTIONS: Array<{ moduleTitle: string; questionText: string; options: string[]; correctIndex: number; order: number }> = [
  { moduleTitle: "The Heart of a Leader", questionText: "What is the primary model for servant leadership?", options: ["Julius Caesar", "Jesus Christ", "Abraham Lincoln", "Martin Luther King Jr."], correctIndex: 1, order: 1 },
  { moduleTitle: "The Heart of a Leader", questionText: "Which best describes integrity in leadership?", options: ["Doing right only when watched", "Alignment between values and actions", "Being popular among your team", "Having all the answers"], correctIndex: 1, order: 2 },
  { moduleTitle: "The Heart of a Leader", questionText: "Healthy leaders lead from their:", options: ["Fear of failure", "Desire for approval", "Identity in Christ", "Position of authority"], correctIndex: 2, order: 3 },
  { moduleTitle: "Vision Casting & Communication", questionText: "Vision in ministry is best described as:", options: ["A detailed budget plan", "A compelling picture of a preferred future", "A list of church programs", "An organizational chart"], correctIndex: 1, order: 1 },
  { moduleTitle: "Vision Casting & Communication", questionText: "The most effective vision communicators:", options: ["Use complex theological language", "Repeat vision only at annual meetings", "Tell stories that connect people emotionally", "Focus exclusively on statistics"], correctIndex: 2, order: 2 },
  { moduleTitle: "Understanding Gen Z", questionText: "Gen Z is primarily characterized by:", options: ["Having grown up without the internet", "Being the first truly digital-native generation", "Valuing tradition above all else", "Avoiding social media"], correctIndex: 1, order: 1 },
  { moduleTitle: "Understanding Gen Z", questionText: "To connect authentically with teenagers, leaders should:", options: ["Only use formal settings", "Meet them in their world with genuine interest", "Require them to adapt to adult culture", "Avoid all social media"], correctIndex: 1, order: 2 },
  { moduleTitle: "Creating Safe Environments", questionText: "Background checks for volunteers in kids ministry are:", options: ["Optional for long-time church members", "Required only for paid staff", "Essential for all volunteers working with minors", "Unnecessary if a pastor vouches for them"], correctIndex: 2, order: 1 },
  { moduleTitle: "Creating Safe Environments", questionText: "A two-adult rule in children's ministry means:", options: ["Two kids must be present at all times", "No adult should be alone with a child", "Two background checks per volunteer", "Two parents must accompany each child"], correctIndex: 1, order: 2 },
  { moduleTitle: "Teaching Children Effectively", questionText: "Different learning styles in children include:", options: ["Only visual and auditory", "Only kinesthetic and reading", "Visual, auditory, kinesthetic, and reading/writing", "Only visual learning"], correctIndex: 2, order: 1 },
  { moduleTitle: "Teaching Children Effectively", questionText: "Object lessons are effective for children because they:", options: ["Keep kids quiet", "Make abstract truths concrete and memorable", "Replace the need for Scripture", "Are easier to prepare"], correctIndex: 1, order: 2 },
];

async function seed() {
  console.log("🌱 Seeding database...");

  // Seed tracks
  const trackMap = new Map<string, number>();
  for (const track of TRACKS) {
    const existing = await db.select().from(tracksTable).where(eq(tracksTable.name, track.name)).limit(1);
    if (existing[0]) {
      trackMap.set(track.name, existing[0].id);
      console.log(`  ✓ Track already exists: ${track.name}`);
    } else {
      const inserted = await db.insert(tracksTable).values(track).returning();
      trackMap.set(track.name, inserted[0].id);
      console.log(`  + Created track: ${track.name}`);
    }
  }

  // Seed modules
  const moduleMap = new Map<string, number>();
  for (const mod of MODULES) {
    const trackId = trackMap.get(mod.trackName);
    if (!trackId) { console.warn(`  ! Track not found: ${mod.trackName}`); continue; }
    const existing = await db.select().from(modulesTable)
      .where(eq(modulesTable.title, mod.title)).limit(1);
    if (existing[0]) {
      moduleMap.set(mod.title, existing[0].id);
      console.log(`  ✓ Module already exists: ${mod.title}`);
    } else {
      const inserted = await db.insert(modulesTable).values({ trackId, title: mod.title, description: mod.description, order: mod.order }).returning();
      moduleMap.set(mod.title, inserted[0].id);
      console.log(`  + Created module: ${mod.title}`);
    }
  }

  // Seed videos
  for (const vid of VIDEOS) {
    const moduleId = moduleMap.get(vid.moduleTitle);
    if (!moduleId) { console.warn(`  ! Module not found: ${vid.moduleTitle}`); continue; }
    const existing = await db.select().from(videosTable)
      .where(eq(videosTable.title, vid.title)).limit(1);
    if (existing[0]) {
      console.log(`  ✓ Video already exists: ${vid.title}`);
    } else {
      await db.insert(videosTable).values({ moduleId, title: vid.title, description: vid.description, url: vid.url, durationSeconds: vid.durationSeconds, order: vid.order });
      console.log(`  + Created video: ${vid.title}`);
    }
  }

  // Seed quiz questions
  for (const q of QUIZ_QUESTIONS) {
    const moduleId = moduleMap.get(q.moduleTitle);
    if (!moduleId) { console.warn(`  ! Module not found: ${q.moduleTitle}`); continue; }
    const existing = await db.select().from(quizQuestionsTable)
      .where(eq(quizQuestionsTable.moduleId, moduleId)).limit(1);
    // Only seed if no questions exist for this module yet
    if (existing.length === 0 || !existing.find(() => true)) {
      await db.insert(quizQuestionsTable).values({ moduleId, questionText: q.questionText, options: q.options, correctIndex: q.correctIndex, order: q.order });
      console.log(`  + Created question: ${q.questionText.slice(0, 50)}...`);
    } else {
      const allQ = await db.select().from(quizQuestionsTable).where(eq(quizQuestionsTable.moduleId, moduleId));
      if (!allQ.find(dbQ => dbQ.questionText === q.questionText)) {
        await db.insert(quizQuestionsTable).values({ moduleId, questionText: q.questionText, options: q.options, correctIndex: q.correctIndex, order: q.order });
        console.log(`  + Created question: ${q.questionText.slice(0, 50)}...`);
      } else {
        console.log(`  ✓ Question already exists`);
      }
    }
  }

  // Seed default settings
  const existingSetting = await db.select().from(settingsTable).where(eq(settingsTable.key, "max_video_upload_size_mb")).limit(1);
  if (!existingSetting[0]) {
    await db.insert(settingsTable).values({ key: "max_video_upload_size_mb", value: "500" });
    console.log("  + Created default setting: max_video_upload_size_mb = 500");
  } else {
    console.log("  ✓ Setting already exists: max_video_upload_size_mb");
  }

  console.log("✅ Seed complete.");
  await pool.end();
}

seed().catch(err => {
  console.error("Seed failed:", err);
  process.exit(1);
});
