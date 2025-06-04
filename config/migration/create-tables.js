const { sequelize } = require("../database");

const createTables = async () => {
  try {
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS submissions (
        id SERIAL PRIMARY KEY,
        userId VARCHAR(255) NOT NULL,
        title VARCHAR(255) NOT NULL,
        artist VARCHAR(255) NOT NULL,
        link VARCHAR(255),
        duration INTEGER,
        feedback TEXT,
        feedback_by VARCHAR(255),
        feedback_at TIMESTAMP,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        platformContext JSONB,
        items JSONB
      );
    `);
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS users (
        user_id VARCHAR(255) PRIMARY KEY,
        given_name VARCHAR(100),
        family_name VARCHAR(100),
        name VARCHAR(200),
        email VARCHAR(255) UNIQUE NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        roles VARCHAR(255)[] DEFAULT ARRAY[]::VARCHAR(255)[]
      );
    `);
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS audio_files (
        id SERIAL PRIMARY KEY,
        user_id VARCHAR(255) REFERENCES users(user_id),
        file_name VARCHAR(255) NOT NULL,
        file_url VARCHAR(1024) NOT NULL,
        mime_type VARCHAR(100),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log("✅ Database tables created successfully");
  } catch (error) {
    console.error("❌ Error creating tables:", error);
  } finally {
    await sequelize.close(); // Close the connection
  }
};

// Execute the function if this file is run directly
if (require.main === module) {
  createTables()
    .then(() => console.log("Migration completed"))
    .catch((error) => console.error("Migration failed:", error));
}
