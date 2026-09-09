import { useGetDashboardSummary, useGetMe } from "@workspace/api-client-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { BookOpen, Calendar, CheckCircle2, Clock, PlayCircle, Sparkles, Trophy, Video } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export default function Dashboard() {
  const { data: summary, isLoading, error } = useGetDashboardSummary();
  const { data: user } = useGetMe();

  if (isLoading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-8 bg-muted rounded w-1/4"></div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => <div key={i} className="h-32 bg-muted rounded-xl"></div>)}
        </div>
        <div className="h-64 bg-muted rounded-xl"></div>
      </div>
    );
  }

  if (error || !summary) {
    return (
      <div className="p-8 text-center bg-destructive/10 text-destructive rounded-xl border border-destructive/20">
        <p>Could not load dashboard data. Please try again later.</p>
      </div>
    );
  }

  const {
    assignedModules,
    totalModulesAvailable,
    totalModulesCompleted,
    totalVideosWatched,
    queueCount,
    recentActivity
  } = summary;

  const progressPercent = totalModulesAvailable > 0
    ? Math.round((totalModulesCompleted / totalModulesAvailable) * 100)
    : 0;

  const isProfileIncomplete = user && (!user.phone || !user.firstName || !user.lastName);
  const isPlanningCenterManaged = Boolean(user?.planningCenterPersonId);
  const newAssignmentsCount = assignedModules.filter((a: any) => a.isNew).length;

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h1 className="text-3xl font-bold font-serif text-foreground">Welcome Back</h1>
        <p className="text-muted-foreground mt-2">Here's where you left off on your leadership journey.</p>
      </div>

      {/* Incomplete profile banner */}
      {isProfileIncomplete && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className="text-amber-500 mt-0.5">⚠️</span>
            <div>
              <p className="font-semibold text-amber-800">Your profile is incomplete</p>
              <p className="text-sm text-amber-700 mt-0.5">
                {isPlanningCenterManaged
                  ? "Update the missing information in the Church Center app, then sign in again."
                  : <>
                      {!user?.firstName || !user?.lastName ? "Add your full name " : ""}
                      {!user?.phone ? "and phone number " : ""}
                      to complete your profile.
                    </>}
              </p>
            </div>
          </div>
          <Link href="/profile">
            <Button size="sm" variant="outline" className="border-amber-300 text-amber-800 hover:bg-amber-100 shrink-0">
              {isPlanningCenterManaged ? "View Profile" : "Complete Profile"}
            </Button>
          </Link>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-primary/5 border-primary/20 shadow-sm">
          <CardContent className="p-6">
            <div className="flex items-center justify-between space-y-0 pb-2">
              <p className="text-sm font-medium">Overall Progress</p>
              <Trophy className="h-4 w-4 text-primary" />
            </div>
            <div className="text-3xl font-bold">{progressPercent}%</div>
            <p className="text-xs text-muted-foreground mt-1">
              {totalModulesCompleted} of {totalModulesAvailable} modules
            </p>
            <Progress value={progressPercent} className="mt-3 h-2" />
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardContent className="p-6">
            <div className="flex items-center justify-between space-y-0 pb-2">
              <p className="text-sm font-medium">Modules Completed</p>
              <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="text-3xl font-bold">{totalModulesCompleted}</div>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardContent className="p-6">
            <div className="flex items-center justify-between space-y-0 pb-2">
              <p className="text-sm font-medium">Videos Watched</p>
              <Video className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="text-3xl font-bold">{totalVideosWatched}</div>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardContent className="p-6">
            <div className="flex items-center justify-between space-y-0 pb-2">
              <p className="text-sm font-medium">In Queue</p>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="text-3xl font-bold">{queueCount}</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">
          {assignedModules.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold flex items-center gap-2">
                  <Calendar className="w-5 h-5 text-primary" />
                  Assigned to You
                  {newAssignmentsCount > 0 && (
                    <Badge className="bg-primary text-primary-foreground text-xs">
                      {newAssignmentsCount} New
                    </Badge>
                  )}
                </h2>
              </div>
              <div className="grid grid-cols-1 gap-4">
                {assignedModules.map((assignment: any) => {
                  const isNew = assignment.isNew;
                  return (
                    <Card
                      key={assignment.id}
                      className={`border-l-4 overflow-hidden shadow-sm hover:shadow-md transition-shadow ${
                        isNew ? "border-l-primary bg-primary/5" : "border-l-primary/40"
                      }`}
                    >
                      <div className="p-6 flex flex-col md:flex-row gap-4 justify-between md:items-center">
                        <div>
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <span className="text-xs font-semibold uppercase tracking-wider text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                              Required
                            </span>
                            {isNew && (
                              <span className="text-xs font-semibold text-white bg-primary px-2 py-0.5 rounded-full flex items-center gap-1">
                                <Sparkles className="w-3 h-3" /> New
                              </span>
                            )}
                            {assignment.dueDate && (
                              <span className="text-xs text-muted-foreground flex items-center gap-1">
                                <Clock className="w-3 h-3" /> Due {new Date(assignment.dueDate).toLocaleDateString()}
                              </span>
                            )}
                          </div>
                          <h3 className="text-lg font-bold">{assignment.module.title}</h3>
                          <p className="text-sm text-muted-foreground line-clamp-1 mt-1">
                            {assignment.module.description}
                          </p>
                        </div>
                        <div className="flex-shrink-0">
                          {assignment.moduleCompletedAt || assignment.quizResult?.passed ? (
                            <div className="flex items-center gap-2 text-green-600 font-medium">
                              <CheckCircle2 className="w-5 h-5" /> Completed
                            </div>
                          ) : (
                            <Link href={`/modules/${assignment.moduleId}`}>
                              <Button className={isNew ? "" : "variant-outline"}>
                                {isNew ? "Start Now" : "Start Module"}
                              </Button>
                            </Link>
                          )}
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </div>
            </div>
          )}

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold flex items-center gap-2">
                <BookOpen className="w-5 h-5" />
                Continue Learning
              </h2>
              <Link href="/tracks">
                <Button variant="ghost" size="sm">Browse all tracks</Button>
              </Link>
            </div>

            {recentActivity.length > 0 ? (
              <div className="space-y-3">
                {recentActivity.slice(0, 3).map((activity: any) => (
                  <Card key={activity.id} className="hover:bg-muted/30 transition-colors shadow-sm">
                    <div className="p-4 flex items-center gap-4">
                      <div className="relative w-24 h-16 rounded overflow-hidden bg-muted flex-shrink-0">
                        {activity.video.thumbnailUrl ? (
                          <img src={activity.video.thumbnailUrl} alt={activity.video.title} className="object-cover w-full h-full" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center bg-secondary/10 text-secondary">
                            <PlayCircle className="w-6 h-6" />
                          </div>
                        )}
                        <div className="absolute bottom-0 left-0 right-0 h-1 bg-muted-foreground/30">
                          <div className="h-full bg-primary" style={{ width: `${activity.progressPercent}%` }} />
                        </div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="font-semibold text-sm truncate">{activity.video.title}</h4>
                        <p className="text-xs text-muted-foreground mt-1">
                          Watched {new Date(activity.lastWatchedAt).toLocaleDateString()}
                        </p>
                      </div>
                      <Link href={`/watch/${activity.videoId}`}>
                        <Button variant="secondary" size="sm">
                          {activity.progressPercent > 0 && !activity.completed ? 'Resume' : 'Watch'}
                        </Button>
                      </Link>
                    </div>
                  </Card>
                ))}
              </div>
            ) : (
              <Card className="border-dashed bg-muted/10">
                <CardContent className="p-8 text-center">
                  <Video className="w-12 h-12 text-muted-foreground/50 mx-auto mb-3" />
                  <h3 className="font-medium text-foreground mb-1">No recent activity</h3>
                  <p className="text-sm text-muted-foreground mb-4">Start a training module to see it here.</p>
                  <Link href="/tracks">
                    <Button>Explore Tracks</Button>
                  </Link>
                </CardContent>
              </Card>
            )}
          </div>
        </div>

        <div className="space-y-6">
          <Card className="shadow-sm">
            <CardHeader className="pb-3 border-b border-border/50">
              <CardTitle className="text-lg font-bold">Your Queue</CardTitle>
              <CardDescription>Videos saved for later</CardDescription>
            </CardHeader>
            <CardContent className="pt-4">
              {queueCount > 0 ? (
                <div className="space-y-4 text-center pb-2">
                  <div className="text-4xl font-light text-muted-foreground">{queueCount}</div>
                  <p className="text-sm">videos waiting</p>
                  <Link href="/queue" className="block w-full">
                    <Button variant="outline" className="w-full">View Queue</Button>
                  </Link>
                </div>
              ) : (
                <div className="text-center py-6">
                  <p className="text-sm text-muted-foreground">Your queue is empty.</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
