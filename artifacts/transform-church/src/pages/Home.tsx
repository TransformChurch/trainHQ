import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Video, BookOpen, Compass } from "lucide-react";
import wordmark from "@assets/TC_Black_Wordmark_1782833324395.png";

const features = [
  {
    icon: Video,
    title: "Video Training",
    description: "Watch training for your team at your own pace, on any device.",
  },
  {
    icon: BookOpen,
    title: "Church Resources",
    description: "Find the documents, guides and information you need in one place.",
  },
  {
    icon: Compass,
    title: "Leadership Tools",
    description: "Tools that help you lead your team and care for the people you serve.",
  },
];

export default function Home() {
  const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

  return (
    <div className="min-h-[100dvh] flex flex-col bg-background">
      <header className="px-4 sm:px-6 h-20 flex items-center justify-between gap-4 border-b border-border bg-background/90 backdrop-blur-sm sticky top-0 z-50">
        <img src={wordmark} alt="Transform Church" className="h-6 sm:h-8 w-auto min-w-0" />
        <Link href={`${basePath}/sign-in`} className="shrink-0" data-testid="landing-login-link">
          <Button>Sign In</Button>
        </Link>
      </header>

      <main className="flex-1 flex flex-col">
        <section className="w-full bg-black text-white py-24 md:py-36 px-6">
          <div className="max-w-4xl mx-auto flex flex-col items-center text-center">
            <h1 className="text-4xl md:text-6xl font-extrabold uppercase tracking-tight mb-6">
              Equipping leaders for kingdom impact
            </h1>
            <p className="text-lg md:text-xl text-white/75 mb-10 max-w-2xl leading-relaxed">
              A purposeful learning space to grow your leadership skills, deepen your theological understanding, and prepare for ministry.
            </p>
            <Link href={`${basePath}/sign-in`} data-testid="hero-cta-signin">
              <Button size="lg" variant="outline" className="h-14 px-10 text-base font-bold uppercase tracking-wide bg-transparent text-white border-2 border-white hover:bg-white hover:text-black">
                Sign In
              </Button>
            </Link>
          </div>
        </section>

        <section className="w-full py-20 md:py-24 px-6">
          <div className="max-w-6xl mx-auto">
            <h2 className="text-2xl md:text-4xl font-extrabold tracking-tight text-center text-foreground mb-14 max-w-3xl mx-auto">
              Everything you need to serve and lead at Transform Church
            </h2>
            <div className="grid md:grid-cols-3 gap-6">
              {features.map(({ icon: Icon, title, description }) => (
                <div key={title} className="flex flex-col items-center text-center rounded-lg border border-border bg-card p-8">
                  <div className="w-14 h-14 rounded-lg bg-primary text-primary-foreground flex items-center justify-center mb-5">
                    <Icon className="w-7 h-7" />
                  </div>
                  <h3 className="text-xl font-bold mb-2 text-foreground">{title}</h3>
                  <p className="text-muted-foreground">{description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>

      <footer className="w-full py-10 px-6 border-t border-border bg-background">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
          <img src={wordmark} alt="Transform Church" className="h-6 w-auto" />
          <p className="text-sm text-muted-foreground">
            © {new Date().getFullYear()} Transform Church. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
