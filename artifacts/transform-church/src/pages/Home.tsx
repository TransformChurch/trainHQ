import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { BookOpen, Users, Video, ShieldCheck, ChevronRight } from "lucide-react";

export default function Home() {
  const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

  return (
    <div className="min-h-[100dvh] flex flex-col bg-background">
      <header className="px-6 h-20 flex items-center justify-between border-b border-border/50 bg-background/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <div className="bg-primary/20 p-2 rounded-lg text-primary">
            <BookOpen className="w-6 h-6" />
          </div>
          <span className="text-xl font-bold text-foreground">Transform Church</span>
        </div>
        <div className="flex items-center gap-4">
          <Link href={`${basePath}/sign-in`} className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors" data-testid="landing-login-link">
            Sign In
          </Link>
          <Link href={`${basePath}/sign-up`} data-testid="landing-signup-link">
            <Button>Get Started</Button>
          </Link>
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center">
        <section className="w-full py-24 md:py-32 px-6 flex flex-col items-center text-center max-w-4xl mx-auto">
          <div className="inline-flex items-center rounded-full border border-border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 mb-8 bg-primary/10 text-primary border-primary/20">
            Now enrolling for Fall Leadership Track
          </div>
          <h1 className="text-5xl md:text-7xl font-bold tracking-tight text-foreground mb-6 font-serif">
            Equipping leaders for <span className="text-primary">kingdom impact.</span>
          </h1>
          <p className="text-xl text-muted-foreground mb-10 max-w-2xl leading-relaxed">
            A purposeful learning space to grow your leadership skills, deepen your theological understanding, and prepare for ministry.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 w-full sm:w-auto">
            <Link href={`${basePath}/sign-up`} className="w-full sm:w-auto" data-testid="hero-cta-signup">
              <Button size="lg" className="w-full sm:w-auto text-base h-14 px-8 group">
                Start Learning
                <ChevronRight className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </Button>
            </Link>
          </div>
        </section>

        <section className="w-full bg-sidebar py-24 px-6 border-y border-border">
          <div className="max-w-6xl mx-auto">
            <div className="grid md:grid-cols-3 gap-12">
              <div className="flex flex-col items-center text-center">
                <div className="w-16 h-16 rounded-2xl bg-background border border-border flex items-center justify-center mb-6 shadow-sm text-primary">
                  <BookOpen className="w-8 h-8" />
                </div>
                <h3 className="text-xl font-bold mb-3 text-foreground">Curated Tracks</h3>
                <p className="text-muted-foreground">Follow structured learning paths designed by pastoral staff for specific ministry areas.</p>
              </div>
              <div className="flex flex-col items-center text-center">
                <div className="w-16 h-16 rounded-2xl bg-background border border-border flex items-center justify-center mb-6 shadow-sm text-primary">
                  <Video className="w-8 h-8" />
                </div>
                <h3 className="text-xl font-bold mb-3 text-foreground">Video Modules</h3>
                <p className="text-muted-foreground">Learn from high-quality teaching sessions that you can watch at your own pace.</p>
              </div>
              <div className="flex flex-col items-center text-center">
                <div className="w-16 h-16 rounded-2xl bg-background border border-border flex items-center justify-center mb-6 shadow-sm text-primary">
                  <ShieldCheck className="w-8 h-8" />
                </div>
                <h3 className="text-xl font-bold mb-3 text-foreground">Knowledge Checks</h3>
                <p className="text-muted-foreground">Ensure comprehension with end-of-module quizzes to reinforce key concepts.</p>
              </div>
            </div>
          </div>
        </section>
      </main>
      
      <footer className="w-full py-12 px-6 border-t border-border bg-background">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-2 text-foreground font-semibold">
            <BookOpen className="w-5 h-5 text-primary" />
            Transform Church
          </div>
          <p className="text-sm text-muted-foreground">
            © {new Date().getFullYear()} Transform Church. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}