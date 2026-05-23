import { useGetModule, useGetQuiz, useSubmitQuiz, useGetQuizResult, getGetModuleQueryKey, getGetQuizResultQueryKey, getGetQuizQueryKey } from "@workspace/api-client-react";
import { useParams, Link } from "wouter";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, CheckCircle2, PlayCircle, Lock, Trophy } from "lucide-react";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

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
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [answers, setAnswers] = useState<Record<number, number>>({});

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

    submitQuiz({
      moduleId,
      data: { answers: submissionAnswers }
    }, {
      onSuccess: () => {
        toast({ title: "Quiz submitted successfully!" });
        queryClient.invalidateQueries({ queryKey: getGetQuizResultQueryKey(moduleId) });
        queryClient.invalidateQueries({ queryKey: getGetModuleQueryKey(moduleId) });
      },
      onError: () => {
        toast({ title: "Error submitting quiz", variant: "destructive" });
      }
    });
  };

  const isQuizPassed = quizResult?.passed || moduleData.quizResult?.passed;
  const bestScore = quizResult?.score ?? moduleData.quizResult?.score;

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div>
        <Link href={`/tracks/${moduleData.trackId}`} className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-6 transition-colors">
          <ArrowLeft className="w-4 h-4 mr-1" /> Back to Track
        </Link>
        <h1 className="text-3xl md:text-4xl font-bold font-serif text-foreground">{moduleData.title}</h1>
        <p className="text-lg text-muted-foreground mt-2">{moduleData.description}</p>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {moduleData.videos?.sort((a, b) => a.order - b.order).map((video, idx) => (
          <Card key={video.id} className="p-4 hover:border-primary/50 transition-colors">
            <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
              <div className="flex gap-4 items-center">
                <div className="w-12 h-12 rounded bg-muted flex items-center justify-center shrink-0">
                  {video.thumbnailUrl ? (
                    <img src={video.thumbnailUrl} alt={video.title} className="w-full h-full object-cover rounded" />
                  ) : (
                    <PlayCircle className="w-6 h-6 text-muted-foreground" />
                  )}
                </div>
                <div>
                  <h3 className="font-bold">Part {idx + 1}: {video.title}</h3>
                  <div className="flex items-center gap-2 mt-1">
                    {video.completed ? (
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
                <Button variant={video.completed ? "outline" : "default"} className="w-full md:w-auto">
                  {video.completed ? "Watch Again" : video.progressPercent ? "Resume" : "Start Video"}
                </Button>
              </Link>
            </div>
          </Card>
        ))}
      </div>

      <div className="pt-8 border-t border-border">
        <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
          Knowledge Check
          {!moduleData.quizUnlocked && <Lock className="w-5 h-5 text-muted-foreground" />}
        </h2>

        {!moduleData.quizUnlocked ? (
          <Card className="bg-muted/20 border-dashed">
            <CardContent className="p-8 text-center text-muted-foreground">
              <Lock className="w-8 h-8 mx-auto mb-3 opacity-50" />
              <p>Complete all videos in this module to unlock the knowledge check.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            {isQuizPassed && (
              <Card className="bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-800">
                <CardContent className="p-6 flex items-center gap-4">
                  <Trophy className="w-8 h-8 text-green-600 dark:text-green-400" />
                  <div>
                    <h3 className="font-bold text-green-800 dark:text-green-300">Module Passed!</h3>
                    <p className="text-green-700 dark:text-green-400 text-sm">
                      Best Score: {bestScore}%
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}

            {quiz && quiz.length > 0 ? (
              <Card>
                <CardHeader>
                  <CardTitle>Module Quiz</CardTitle>
                  <CardDescription>Answer the questions below to test your understanding.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-8">
                  {quiz.map((q, idx) => (
                    <div key={q.id} className="space-y-3">
                      <p className="font-medium">{idx + 1}. {q.questionText}</p>
                      <RadioGroup 
                        value={answers[q.id]?.toString()} 
                        onValueChange={(val) => setAnswers(prev => ({ ...prev, [q.id]: parseInt(val) }))}
                      >
                        {q.options.map((opt, optIdx) => (
                          <div key={optIdx} className="flex items-center space-x-2">
                            <RadioGroupItem value={optIdx.toString()} id={`q${q.id}-opt${optIdx}`} />
                            <Label htmlFor={`q${q.id}-opt${optIdx}`}>{opt}</Label>
                          </div>
                        ))}
                      </RadioGroup>
                    </div>
                  ))}
                  <Button onClick={handleQuizSubmit} disabled={isSubmitting}>
                    {isSubmitting ? "Submitting..." : isQuizPassed ? "Retake Quiz" : "Submit Quiz"}
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