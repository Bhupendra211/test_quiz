import Result from "../../models/result.model.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { paginate } from "../../utils/paginate.js";
import { errorResponse, successResponse } from "../../utils/responseHandler.js";
import Quiz from "../../models/quiz.model.js";
import StudentAttempt from "../../models/studentAttempt.model.js";
import mongoose from 'mongoose'; // Make sure this is imported

export const getAllResults = asyncHandler(async (req, res) => {
  const { page = 1, limit = 10 } = req.query;
  const { quizId } = req.params; // ✅ get quizId from params

  try {
    const results = await Result.aggregate([
      {
        $match: {
          quiz_id: new mongoose.Types.ObjectId(quizId), // ✅ Match the quiz_id
        },
      },
      {
        $lookup: {
          from: "users",
          localField: "student_id",
          foreignField: "_id",
          as: "student",
        },
      },
      { $unwind: "$student" },
      {
        $lookup: {
          from: "quizzes",
          localField: "quiz_id",
          foreignField: "_id",
          as: "quiz",
        },
      },
      { $unwind: "$quiz" },
      {
        $project: {
          _id: 1,
          total_score: 1,
          total_correct: 1,
          total_attempt: 1,
          "student.name": 1,
          "student.username": 1,
          "student.dob": 1,
          "student.role": 1,
          "quiz.title": 1,
        },
      },
      { $skip: (page - 1) * limit },
      { $limit: parseInt(limit) },
    ]);

    if (!results.length) {
      return errorResponse(res, 404, "No results found", null);
    }

    return successResponse(res, 200, "Results Fetched Successfully", results);
  } catch (error) {
    console.log(error.message);
    return errorResponse(res, 500, "Internal Server Error");
  }
});


export const generateResult = asyncHandler(async (req, res) => {
  try {
    const { quiz_id } = req.params;

    if (!quiz_id) {
      return errorResponse(res, 400, "quiz_id is required");
    }

    const quiz = await Quiz.findById(quiz_id).lean();
    if (!quiz) {
      return errorResponse(res, 404, "Quiz not found");
    }

    const { marks = 1, negative = 0 } = quiz;

    // Setup cursor to handle large data
    const cursor = StudentAttempt.find({ quiz_id }).cursor();
    let bulkOperations = [];
    let processed = 0;

    for await (const attempt of cursor) {
      let score = 0;
      let correct = 0;
      let total_attempts = 0;

      attempt.answers.forEach((ans) => {
        if (ans.answer_status === "right") {
          score += marks;
          correct++;
        } else if (ans.answer_status === "wrong") {
          score -= negative;
        }
        total_attempts++;
      });

      score = isNaN(score) ? 0 : score;

      bulkOperations.push({
        updateOne: {
          filter: {
            student_id: attempt.student_id,
            quiz_id: attempt.quiz_id,
          },
          update: {
            $set: {
              total_score: score,
              total_correct: correct,
              total_attempt: total_attempts,
              status: "completed",
            },
          },
          upsert: true,
        },
      });

      processed++;

      // Execute in chunks of 100
      if (bulkOperations.length === 100) {
        await Result.bulkWrite(bulkOperations);
        bulkOperations = [];
      }
    }

    if (bulkOperations.length > 0) {
      await Result.bulkWrite(bulkOperations);
    }

    return successResponse(res, 200, `✅ Result processed for ${processed} students`);
  } catch (error) {
    console.error("Error during result generation:", error);
    return errorResponse(res, 500, "Internal Server Error");
  }
});


export const getResultStatus = asyncHandler(async (req, res) => {
  const { quiz_id } = req.params;
  if (!quiz_id) {
    return errorResponse(res, 400, "quiz_id is required");
  }

  const results = await Result.find({ quiz_id });
  if (!results.length) {
    return res.status(200).json({ success: false, message: "Result not yet generated." });
  }

  return successResponse(res, 200, "Result is ready", results);
});
