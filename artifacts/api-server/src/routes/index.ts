import { Router, type IRouter } from "express";
import healthRouter from "./health";
import usersRouter from "./users";
import tracksRouter from "./tracks";
import modulesRouter from "./modules";
import videosRouter from "./videos";
import watchHistoryRouter from "./watchHistory";
import queueRouter from "./queue";
import quizzesRouter from "./quizzes";
import assignmentsRouter from "./assignments";
import adminRouter from "./admin";
import dashboardRouter from "./dashboard";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/users", usersRouter);
router.use("/tracks", tracksRouter);
router.use("/modules", modulesRouter);
router.use("/videos", videosRouter);
router.use("/watch-history", watchHistoryRouter);
router.use("/queue", queueRouter);
router.use("/quizzes", quizzesRouter);
router.use("/modules", quizzesRouter);
router.use("/assignments", assignmentsRouter);
router.use("/admin", adminRouter);
router.use("/dashboard", dashboardRouter);

export default router;
