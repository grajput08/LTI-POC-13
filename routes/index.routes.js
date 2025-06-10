const express = require("express");
const router = express.Router();
// Requiring Ltijs
const lti = require("ltijs").Provider;
const { dbQueries } = require("../config/queries");

// Grading helper function
async function submitGrade(
  idtoken,
  score,
  userId = null,
  scoreMaximum = 100,
  activityProgress = "Submitted",
  gradingProgress = "FullyGraded"
) {
  // Creating Grade object
  const gradeObj = {
    userId: userId || idtoken.user,
    scoreGiven: score,
    scoreMaximum: scoreMaximum,
    activityProgress: activityProgress,
    gradingProgress: gradingProgress,
  };

  // Selecting lineItem ID
  let lineItemId = idtoken.platformContext.endpoint.lineitem; // Attempting to retrieve it from idtoken
  if (!lineItemId) {
    const response = await lti.Grade.getLineItems(idtoken, {
      resourceLinkId: true,
    });
    const lineItems = response.lineItems;
    if (lineItems.length === 0) {
      // Creating line item if there is none
      console.log("Creating new line item");
      const newLineItem = {
        scoreMaximum: 100,
        label: "Grade",
        tag: "grade",
        resourceLinkId: idtoken.platformContext.resource.id,
      };
      const lineItem = await lti.Grade.createLineItem(idtoken, newLineItem);
      lineItemId = lineItem.id;
    } else lineItemId = lineItems[0].id;
  }

  // Sending Grade
  return await lti.Grade.submitScore(idtoken, lineItemId, gradeObj);
}

// Grading route
router.post("/grade", async (req, res) => {
  try {
    const idtoken = res.locals.token; // IdToken
    const score = req.body.grade;
    const userId = req.body.userId; // User numeric score sent in the body
    const responseGrade = await submitGrade(
      idtoken,
      score,
      userId,
      100,
      "Completed",
      "FullyGraded"
    );
    return res.send(responseGrade);
  } catch (err) {
    console.log(err);
    return res.status(500).send({ err: err.message });
  }
});

// GET /info route
router.get("/info", async (req, res) => {
  const token = res.locals.token;
  const context = res.locals.context;

  const info = {};
  if (token.userInfo) {
    if (token.userInfo.name) info.name = token.userInfo.name;
    if (token.userInfo.email) info.email = token.userInfo.email;
  }

  if (context.roles) info.roles = context.roles;
  if (context.context) info.context = context.context;

  return res.send(info);
});

// Names and Roles route
router.get("/members", async (req, res) => {
  try {
    const result = await lti.NamesAndRoles.getMembers(res.locals.token);
    if (result) return res.send(result.members);
    return res.sendStatus(500);
  } catch (err) {
    console.log(err.message);
    return res.status(500).send(err.message);
  }
});

// Audio submission route
router.post("/submit/audio", async (req, res) => {
  try {
    const resource = req.body;
    const token = res.locals.token;
    const roles = res.locals.context?.roles || [];

    // Check if user is a student
    const isStudent = roles.some(
      (role) => role.includes("Student") || role.includes("Learner")
    );

    // Only students can submit assignments
    if (!isStudent) {
      return res.status(403).send({
        error: "Only students can submit assignments",
      });
    }

    // Validate that this is a deep linking request
    if (!token || !token.platformContext) {
      return res.status(400).send({
        error: "Invalid token or context",
      });
    }

    // Validate required fields
    if (!resource.title || !resource.artist) {
      return res.status(400).send({
        error: "Missing required fields: title or artist",
      });
    }

    const items = [
      {
        type: "ltiResourceLink",
        title: resource.title,
        text: `Audio Recording Assignment: ${resource.title}`,
        url: token.platformContext.targetLinkUri,
        custom: {
          resource_link_title: resource.link,
          title: resource.title,
          artist: resource.artist || "",
          assignment_type: "audio_recording",
          duration: resource.duration || 1200,
          transcript: resource.transcript || {
            "0:00": "No transcript available",
            "0:29": "Are you excited to be at GSV?",
            "0:38": "Absolutely.",
            "0:39":
              "It's fantastic to be here at the 2025 ASU GSV summit, sharing the wonders of Dreamscape Learn with everyone.",
          },
        },
        userInfo: {
          user_id: token.user,
          given_name: token.userInfo.given_name,
          family_name: token.userInfo.family_name,
          name: token.userInfo.name,
          email: token.userInfo.email,
        },
      },
    ];

    try {
      const responseJson = {
        token,
        items,
        resource,
      };

      // Save to database
      const submissionData = {
        userId: token.user,
        title: resource.title,
        artist: resource.artist,
        link: resource.link,
        duration: resource.duration || 1200,
        createdAt: new Date(),
        platformContext: token.platformContext,
        items: items,
      };

      console.log("submissionData", submissionData);

      await dbQueries.createSubmission(submissionData);

      // Call submitGrade after successful submission
      let gradeSubmissionResult = null;
      try {
        gradeSubmissionResult = await submitGrade(
          token,
          null,
          null,
          100,
          "Submitted",
          "PendingManual"
        ); // Default score 100
      } catch (gradeError) {
        console.log("Grade submission error", gradeError);
        gradeSubmissionResult = { error: gradeError.message };
      }

      return res.send({
        ...responseJson,
        gradeSubmissionResult,
      });
    } catch (dlError) {
      console.log("dlError", dlError);
      if (dlError instanceof Error) {
        return res.status(400).send({
          error:
            "This route must be accessed through a deep linking launch from your LMS",
        });
      }
      throw dlError;
    }
  } catch (err) {
    if (err instanceof Error) {
      return res.status(500).send({ error: err.message });
    }
    return res.status(500).send({ error: "Unknown error occurred" });
  }
});

// Helper function to format duration from seconds to mm:ss
function formatDuration(seconds) {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
}

// GET /resources route
router.get("/resources", async (req, res) => {
  const resources = [
    {
      title: "Audio Record 1",
      duration: "3:45",
      artist: "Artist1",
      link: "https://actions.google.com/sounds/v1/alarms/digital_watch_alarm_long.ogg",
      transcript: {
        "0:04":
          "I'm Rodney, your interactive AI assistant here in the Dreamscape Learn universe, which is home to some fascinating intergalactic creatures like the Mega Rafi alien zoo, part of the Intergalactic Wildlife Sanctuary, is a virtual reality experience where you can explore diverse alien species and their habitats aimed at preserving endangered species across the galaxy.",
      },
    },
    {
      title: "Audio Record 2",
      duration: "4:20",
      artist: "Artist2",
      link: "https://actions.google.com/sounds/v1/alarms/digital_watch_alarm_long.ogg",
      transcript: {
        "0:29": "Are you excited to be at GSV?",
        "0:38": "Absolutely.",
        "0:39":
          "It's fantastic to be here at the 2025 ASU GSV summit, sharing the wonders of Dreamscape Learn with everyone.",
      },
    },
    {
      title: "Audio Record 3",
      duration: "2:55",
      artist: "Artist3",
      link: "https://actions.google.com/sounds/v1/alarms/digital_watch_alarm_long.ogg",
      transcript: {
        "0:45": "How about you?",
        "0:46": "Are you having a great time at the event?",
      },
    },
  ];
  return res.send(resources);
});

// GET /submitted/audio route
router.get("/submitted/audio", async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;
    const token = res.locals.token;
    const roles = res.locals.context?.roles || [];

    // Check if user is an instructor/admin
    const isInstructor = roles.some(
      (role) =>
        role.includes("Instructor") ||
        role.includes("Administrator") ||
        role.includes("SysAdmin")
    );
    console.log("isInstructor", isInstructor);

    // Fetch submissions using dbQueries
    const { submissions, totalCount } = await dbQueries.getSubmissions(
      token.user,
      isInstructor,
      limit,
      offset
    );
    console.log("submissions", totalCount);
    // Transform the submissions data
    const formattedSubmissions = submissions?.map((submission) => ({
      id: submission.id,
      user: {
        id: submission.userid,
        name: submission.items[0]?.userInfo?.name || "",
        email: submission.items[0]?.userInfo?.email || "",
        givenName: submission.items[0]?.userInfo?.given_name || "",
        familyName: submission.items[0]?.userInfo?.family_name || "",
      },
      submission: {
        title: submission.title,
        artist: submission.artist,
        link: submission.link,
        feedback: submission.feedback,
        feedbackBy: submission.feedback_by,
        feedbackAt: submission.feedback_at,
        transcript: submission.items[0]?.custom?.transcript || {},
        duration: {
          seconds: submission.duration,
          formatted: formatDuration(submission.duration),
        },
        createdAt: submission.createdat,
        aiFeedback: [
          "Pronunciation needs improvement",
          "Rhythm and timing could be better",
          "Overall performance shows good effort",
          "Consider practicing with a metronome",
          "Work on breath control",
          "Try to speak more clearly and slowly",
          "Add more expression and emotion",
          "Practice with a mirror to improve body language",
          "Consider joining a Toastmasters club to enhance public speaking skills",
          "Practice with a timer to improve time management",
        ],
      },
      context: {
        courseTitle: submission.platformcontext?.context?.title || "",
        courseLabel: submission.platformcontext?.context?.label || "",
        roles: submission.platformcontext?.roles || [],
        resourceTitle: submission.platformcontext?.resource?.title || "",
      },
    }));

    const totalItems = parseInt(totalCount[0]?.count || 0);

    return res.send({
      submissions: submissions,
      pagination: {
        currentPage: page,
        itemsPerPage: limit,
        totalItems: totalItems,
        totalPages: Math.ceil(totalItems / limit),
      },
      isInstructor, // Adding this to help frontend know user's role
    });
  } catch (error) {
    // console.log("error", error);
    return res.status(500).send({ error: "Failed to fetch submissions" });
  }
});

// POST /feedback route
router.post("/feedback", async (req, res) => {
  try {
    const { submissionId, feedback } = req.body;
    const token = res.locals.token;
    const roles = res.locals.context?.roles || [];

    // Check if user is an instructor/admin
    const isInstructor = roles.some(
      (role) =>
        role.includes("Instructor") ||
        role.includes("Administrator") ||
        role.includes("SysAdmin")
    );

    // Only instructors can provide feedback
    if (!isInstructor) {
      return res.status(403).send({
        error: "Only instructors can provide feedback",
      });
    }

    // Validate required fields
    if (!submissionId || feedback === undefined) {
      return res.status(400).send({
        error: "Missing required fields: submissionId or feedback",
      });
    }

    // Update the submission with feedback
    await dbQueries.updateFeedback({
      submissionId,
      feedback,
      feedbackBy: token.user,
      feedbackAt: new Date(),
    });

    return res.send({
      message: "Feedback saved successfully",
      submissionId,
      feedback,
    });
  } catch (error) {
    return res.status(500).send({ error: "Failed to save feedback" });
  }
});

// GET /recordings route
router.get("/recordings", async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;
    const token = res.locals.token;
    const roles = res.locals.context?.roles || [];

    // Check if user is an instructor/admin
    const isInstructor = roles.some(
      (role) =>
        role.includes("Instructor") ||
        role.includes("Administrator") ||
        role.includes("SysAdmin")
    );

    const { recordings, totalCount } = await dbQueries.getRecordings(
      token.user,
      isInstructor,
      limit,
      offset
    );

    // Transform the results
    const userRecordings = recordings.rows.map((row) => ({
      user: {
        id: row.user_id,
        name: row.name,
        email: row.email,
        givenName: row.given_name,
        familyName: row.family_name,
      },
      recordings: row.recordings,
    }));

    return res.send({
      recordings: userRecordings,
      pagination: {
        currentPage: page,
        itemsPerPage: limit,
        totalItems: totalCount,
        totalPages: Math.ceil(totalCount / limit),
      },
      isInstructor,
    });
  } catch (error) {
    return res.status(500).send({ error: "Failed to fetch recordings" });
  }
});

// Wildcard route to handle React routes
router.get("*", (req, res) => {
  const token = req.query.ltik;
  const path = req.path;

  if (token) {
    // Redirect to React app with LTI token and preserve the path
    res.redirect(`http://localhost:4001${path}?ltik=${token}`);
  } else {
    res.status(401).json({ error: "No LTI token found" });
  }
});

module.exports = router;
