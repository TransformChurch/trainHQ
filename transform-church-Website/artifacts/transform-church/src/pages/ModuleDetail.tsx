import { useGetModule, useGetQuiz, useSubmitQuiz, useGetQuizResult, getGetModuleQueryKey, getGetQuizResultQueryKey, getGetQuizQueryKey, useCompleteModule } from "@workspace/api-client-react";
import { useParams, Link } from "wouter";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, CheckCircle2, PlayCircle, Lock, Trophy, XCircle, AlertTriangle, RefreshCw, FileText } from "lucide-react";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { DocumentViewer } from "@/components/DocumentViewer";

export default function ModuleDetail() {
  const { moduleId: moduleIdStr } = useParams();
  const moduleId = Number(moduleIdStr);
  const { data: moduleData, isLoading, error } = useGetModule(moduleId, {
    query: { enabled: !!moduleId, queryKey: getGetModuleQueryKey(moduleId) }
  });
  const { data: quiz } = useGetQuiz(moduleId, {
    query: { enabled: !!moduleId && !!moduleData?.quizUnlocked, queryKey: getGetQuizQueryKey(moduleId) }
  });
  const { data: quizResult } = useGetQuizResult(moduleId, {
    query: { enabled: !!moduleId, queryKey: getGetQuizResultQueryKey(moduleId) }
  });

  const { mutate: submitQuiz, isPending: isSubmitting } = useSubmitQuiz();
  const { mutate: markComplete, isPending: isMarkingComplete } = useCompleteModule();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [justSubmitted, setJustSubmitted] = useState(false);

  const handleMarkComplete = () => {
    markComplete({ data: { moduleId } }, {
      onSuccess: (result) => {
        queryClient.invalidateQueries({ queryKey: getGetModuleQueryKey(moduleId) });
        queryClient.invalidateQueries({ queryKey: ["/api/dashboard/summary"] });
        toast({
          title: "Module completed",
          description: result.planningCenterSynced
            ? "Your completion was saved in Transform Church and Planning Center."
            : "Your completion was saved.",
        });
      },
      onError: (err) => {
        toast({
          title: "Could not sync completion",
          description: err instanceof Error ? err.message : "Please try again.",
          variant: "destructive",
        });
      },
    });
  };

  if (isLoading) {
    return <div className="p-8 text-center animate-pulse h-8 bg-muted w-1/3 mx-auto rounded"></div>;
  }

  if (error || !moduleData) {
    return <div className="p-8 text-center text-destructive">Module not found.</div>;
  }

  const handleQuizSubmit = () => {
    if (!quiz) return;
    const submissionAnswers = Object.entries(answers).map(([qId, index]) => ({
      questionId: Number(qId),
      selectedIndex: index
    }));

    if (submissionAnswers.length < quiz.length) {
      toast({
        title: "Incomplete Quiz",
        description: "Please answer all questions before submitting.",
        variant: "destructive"
      });
      return;
    }

    submitQuiz({ moduleId, data: { answers: submissionAnswers } }, {
      onSuccess: (result) => {
        setJustSubmitted(true);
        setAnswers({});
        queryClient.invalidateQueries({ queryKey: getGetQuizResultQueryKey(moduleId) });
        queryClient.invalidateQueries({ queryKey: getGetModuleQueryKey(moduleId) });
        if (result.passed) {
          toast({ title: "Knowledge Check Passed!", description: "Great work — module complete." });
        } else {
          toast({
            title: "Knowledge Check Failed",
            description: moduleData?.contentType === "document"
              ? "Review the document, then try again."
              : "Re-watch the videos marked 'Needs Review', then try again.",
            variant: "destructive"
          });
        }
      },
      onError: () => {
        toast({ title: "Error submitting quiz", variant: "destructive" });
      }
    });
  };

  const latestResult = quizResult ?? moduleData.quizResult ?? null;
  const isQuizPassed = latestResult?.passed === true;
  const rawScore = latestResult?.score;
  const totalQ = latestResult?.totalQuestions ?? 0;
  const scorePercent = rawScore != null && totalQ > 0 ? Math.round((rawScore / totalQ) * 100) : null;
  const attempts = (latestResult as any)?.attempts ?? null;

  const lockedReason = (moduleData as any).lockedReason as string | null;
  const anyNeedsReview = moduleData.videos?.some((v: any) => v.needsReview);

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div>
        <Link href={`/tracks/${moduleData.trackId}`} className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-6 transition-colors">
          <ArrowLeft className="w-4 h-4 mr-1" /> Back to Track
        </Link>
        <h1 className="text-3xl md:text-4xl font-bold font-serif text-foreground">{moduleData.title}</h1>
        <p className="text-lg text-muted-foreground mt-2">{moduleData.description}</p>
        <Badge variant="outline" className="mt-3 gap-1.5 capitalize">
          {moduleData.contentType === "document"
            ? <FileText className="h-3.5 w-3.5" />
            : <PlayCircle className="h-3.5 w-3.5" />}
          {moduleData.contentType} module
        </Badge>
        <div className="mt-5 flex flex-col items-start gap-2 sm:flex-row sm:items-center">
          {moduleData.moduleCompletedAt ? (
            <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-4 py-2 text-sm font-medium text-green-700">
              <CheckCircle2 className="h-4 w-4" />
              Completed and synced {new Date(moduleData.moduleCompletedAt).toLocaleDateString()}
            </div>
          ) : (
            <Button onClick={handleMarkComplete} disabled={isMarkingComplete}>
              <CheckCircle2 className="mr-2 h-4 w-4" />
              {isMarkingComplete ? "Syncing completion…" : "Mark Module Completed"}
            </Button>
          )}
        </div>
        {anyNeedsReview && (
          <div className="mt-4 flex items-center gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>Some videos are marked <strong>Needs Review</strong>. Re-watch them to unlock the knowledge check again.</span>
          </div>
        )}
      </div>

      {moduleData.contentType === "document" ? (
        moduleData.document ? (
          <DocumentViewer title={moduleData.document.title} url={moduleData.document.driveUrl} mimeType={moduleData.document.mimeType} />
        ) : (
          <Card className="border-amber-200 bg-amber-50/50">
            <CardContent className="flex items-center gap-3 p-6 text-amber-800">
              <AlertTriangle className="h-5 w-5 shrink-0" />
              This module&apos;s document is unavailable. Please contact a manager.
            </CardContent>
          </Card>
        )
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {moduleData.videos?.sort((a: any, b: any) => a.order - b.order).map((video: any, idx: number) => (
            <Card key={video.id} className={`p-4 transition-colors ${video.needsReview ? "border-amber-300 bg-amber-50/30" : "hover:border-primary/50"}`}>
              <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
                <div className="flex gap-4 items-center">
                  <div className="w-12 h-12 rounded bg-muted flex items-center justify-center shrink-0">
                    <PlayCircle className="w-6 h-6 text-muted-foreground" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-bold">Part {idx + 1}: {video.title}</h3>
                      {video.needsReview && (
                        <Badge variant="outline" className="border-amber-400 text-amber-700 bg-amber-50 gap-1 text-xs">
                          <RefreshCw className="w-2.5 h-2.5" /> Needs Review
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      {video.completed && !video.needsReview ? (
                        <span className="text-xs text-green-600 font-medium flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" /> Completed
                        </span>
                      ) : video.progressPercent ? (
                        <span className="text-xs text-primary font-medium">
                          {Math.round(video.progressPercent)}% Watched
                        </span>
                      ) : null}
                    </div>
                  </div>
                </div>
                <Link href={`/watch/${video.id}`} className="w-full md:w-auto mt-4 md:mt-0">
                  <Button
                    variant={video.needsReview ? "default" : video.completed ? "outline" : "default"}
                    className={`w-full md:w-auto ${video.needsReview ? "bg-amber-500 hover:bg-amber-600 text-white" : ""}`}
                  >
                    {video.needsReview ? "Re-watch" : video.completed ? "Watch Again" : video.progressPercent ? "Resume" : "Start Video"}
                  </Button>
                </Link>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Knowledge check */}
      <div className="pt-8 border-t border-border">
        <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
          Knowledge Check
          {!moduleData.quizUnlocked && <Lock className="w-5 h-5 text-muted-foreground" />}
        </h2>

        {/* Last result banner (always shown if a result exists) */}
        {latestResult && !justSubmitted && (
          <div className={`mb-6 flex items-center gap-4 rounded-xl border px-6 py-4 ${
            isQuizPassed
              ? "bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-800"
              : "bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-800"
          }`}>
            {isQuizPassed
              ? <Trophy className="w-8 h-8 text-green-600 dark:text-green-400 shrink-0" />
              : <XCircle className="w-8 h-8 text-red-500 dark:text-red-400 shrink-0" />
            }
            <div>
              <h3 className={`font-bold ${isQuizPassed ? "text-green-800 dark:text-green-300" : "text-red-700 dark:text-red-300"}`}>
                {isQuizPassed ? "Passed" : "Failed"}
              </h3>
              <p className={`text-sm ${isQuizPassed ? "text-green-700 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
                Score: {scorePercent ?? 0}%
                {attempts != null && attempts > 1 && <span className="ml-3 opacity-75">Attempt {attempts}</span>}
              </p>
            </div>
          </div>
        )}

        {!moduleData.quizUnlocked ? (
          <Card className="bg-muted/20 border-dashed">
            <CardContent className="p-8 text-center text-muted-foreground">
              <Lock className="w-8 h-8 mx-auto mb-3 opacity-50" />
              {lockedReason === "needs_review"
                ? <p>Re-watch all <strong>Needs Review</strong> videos to unlock the knowledge check.</p>
                : <p>Complete all videos in this module to unlock the knowledge check.</p>
              }
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            {quiz && quiz.length > 0 ? (
              <Card>
                <CardHeader>
                  <CardTitle>Module Quiz</CardTitle>
                  <CardDescription>Answer the questions below to test your understanding. You need 80% or higher to pass.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-8">
                  {quiz.map((q: any, idx: number) => (
                    <div key={q.id} className="space-y-3">
                      <p className="font-medium">{idx + 1}. {q.questionText}</p>
                      <RadioGroup
                        value={answers[q.id]?.toString()}
                        onValueChange={(val) => setAnswers(prev => ({ ...prev, [q.id]: parseInt(val) }))}
                      >
                        {q.options.map((opt: string, optIdx: number) => (
                          <div key={optIdx} className="flex items-center space-x-2">
                            <RadioGroupItem value={optIdx.toString()} id={`q${q.id}-opt${optIdx}`} />
                            <Label htmlFor={`q${q.id}-opt${optIdx}`}>{opt}</Label>
                          </div>
                        ))}
                      </RadioGroup>
                    </div>
                  ))}
                  <Button onClick={handleQuizSubmit} disabled={isSubmitting} className="w-full sm:w-auto">
                    {isSubmitting ? "Submitting..." : latestResult ? "Retake Quiz" : "Submit Quiz"}
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <p className="text-muted-foreground">No quiz available for this module.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
