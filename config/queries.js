"use strict";
const db = require("./database");

class DatabaseQueries {
  constructor() {
    this.db = db;
  }

  /**
   * Creates a new submission in the database
   */
  async createSubmission(data) {
    // Convert duration from "mm:ss" to seconds if needed
    const durationInSeconds =
      typeof data.duration === "string" && data.duration.includes(":")
        ? data.duration
            .split(":")
            .reduce((acc, time) => 60 * acc + parseInt(time), 0)
        : Number(data.duration) || 1200;

    return await this.db.query(
      `INSERT INTO submissions 
            (userid, title, artist, link, duration, createdat, platformcontext, items) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        data.userId,
        data.title,
        data.artist,
        data.link,
        durationInSeconds,
        data.createdAt,
        JSON.stringify(data.platformContext),
        JSON.stringify(data.items),
      ]
    );
  }

  /**
   * Retrieves submissions with pagination and role-based filtering
   */
  async getSubmissions(userId, isInstructor, limit, offset) {
    const countQuery = isInstructor
      ? "SELECT COUNT(*) FROM submissions"
      : "SELECT COUNT(*) FROM submissions WHERE userid = ?";

    const selectQuery = `
            SELECT * FROM submissions 
            ${!isInstructor ? "WHERE userid = ?" : ""} 
            ORDER BY \"createdat\" DESC 
            LIMIT ${isInstructor ? "?" : "?"} 
            OFFSET ${isInstructor ? "?" : "?"}
        `;

    const countResult = await this.db.query(
      countQuery,
      !isInstructor ? [userId] : []
    );

    const submissionsResult = await this.db.query(
      selectQuery,
      !isInstructor ? [userId, limit, offset] : [limit, offset]
    );

    return {
      submissions: submissionsResult[0],
      totalCount: countResult[0],
    };
  }

  /**
   * Updates submission feedback
   */
  async updateFeedback(data) {
    return await this.db.query(
      `UPDATE submissions 
            SET feedback = ?, feedback_by = ?, feedback_at = ? 
            WHERE id = ?`,
      [data.feedback, data.feedbackBy, data.feedbackAt, data.submissionId]
    );
  }

  /**
   * Check if user exists, create if they don't
   */
  async upsertUser(data) {
    // If email is missing, generate a placeholder email using user_id
    const email = data.email || `${data.user_id}@placeholder.com`;

    // First check if user exists
    const existingUser = await this.db.query(
      `SELECT user_id FROM users WHERE user_id = ?`,
      [data.user_id]
    );

    // If user doesn't exist, create new user
    if (existingUser.rows.length === 0) {
      return await this.db.query(
        `INSERT INTO users (user_id, given_name, family_name, name, email, roles)
             VALUES (?, ?, ?, ?, ?, ?)`,
        [
          data.user_id,
          data.given_name || null,
          data.family_name || null,
          data.name || null,
          email, // Use the email or placeholder
          data.roles || [],
        ]
      );
    }

    // If user exists, update their information
    return await this.db.query(
      `UPDATE users 
         SET given_name = COALESCE(?, given_name),
             family_name = COALESCE(?, family_name),
             name = COALESCE(?, name),
             email = COALESCE(?, email),
             roles = COALESCE(?, roles),
             updated_at = CURRENT_TIMESTAMP
         WHERE user_id = ?
         RETURNING *`,
      [
        data.given_name || null,
        data.family_name || null,
        data.name || null,
        email, // Use the email or placeholder
        data.roles || [],
        data.user_id,
      ]
    );
  }

  /**
   * Saves audio file information to database
   */
  async saveAudioFile(data) {
    return await this.db.query(
      `INSERT INTO audio_files 
        (user_id, file_name, file_url, mime_type) 
        VALUES (?, ?, ?, ?)
        RETURNING id, file_url`,
      [data.userId, data.fileName, data.fileUrl, data.mimeType]
    );
  }

  /**
   * Gets recordings with pagination and role-based filtering
   */
  async getRecordings(userId, isInstructor, limit, offset) {
    let countQuery =
      "SELECT COUNT(DISTINCT u.user_id) FROM users u JOIN audio_files af ON u.user_id = af.user_id";
    let selectQuery = `
      SELECT u.user_id, u.name, u.email, u.given_name, u.family_name,
             array_agg(json_build_object(
               'id', af.id,
               'fileName', af.file_name,
               'fileUrl', af.file_url,
               'mimeType', af.mime_type,
               'createdAt', af.created_at
             )) as recordings
      FROM users u
      JOIN audio_files af ON u.user_id = af.user_id`;
    const queryParams = [];

    // If not instructor, only show user's own recordings
    if (!isInstructor) {
      countQuery += " WHERE u.user_id = ?";
      selectQuery += " WHERE u.user_id = ?";
      queryParams.push(userId);
    }

    selectQuery += ` GROUP BY u.user_id, u.name, u.email, u.given_name, u.family_name
                     ORDER BY u.name
                     LIMIT $${queryParams.length + 1} OFFSET $${
      queryParams.length + 2
    }`;
    queryParams.push(limit, offset);

    const countResult = await this.db.query(
      countQuery,
      !isInstructor ? [userId] : []
    );
    const totalCount = parseInt(countResult.rows[0].count);

    const recordings = await this.db.query(selectQuery, queryParams);

    return {
      recordings,
      totalCount,
    };
  }
}

// Export a singleton instance
module.exports = {
  dbQueries: new DatabaseQueries(),
};
