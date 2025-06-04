const path = require("path");
const routes = require("./routes/index.routes");
const dotenv = require("dotenv");

// Load environment variables
dotenv.config();

// Require Provider
const lti = require("ltijs").Provider;
const Database = require("ltijs-sequelize");

// Setup ltijs-sequelize using PostgreSQL configuration from .env
const db = new Database(
  process.env.DB_NAME,
  process.env.DB_USER,
  process.env.DB_PASSWORD,
  {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    dialect: "postgres",
    logging: false,
  }
);

// Setup provider
lti.setup(
  process.env.LTI_KEY, // Using LTI_KEY from .env
  {
    plugin: db, // Passing db object to plugin field
  },
  {
    // Options
    appUrl: `http://localhost:4001?ltik=${process.env.LTI_KEY}`,
    loginUrl: "/login",
    cookies: {
      secure: false, // Set secure to true if the testing platform is in a different domain and https is being used
      sameSite: "", // Set sameSite to 'None' if the testing platform is in a different domain and https is being used
    },
    devMode: true, // Enable devMode in development environment
  }
);

// Set lti launch callback
lti.onConnect((token, req, res) => {
  console.log("LTI Connection Token:", token);
  return res.send("LTI Connection Successful!");
});

// Setting up routes
lti.app.use(routes);

const setup = async () => {
  try {
    // Deploy server and open connection to the database
    await lti.deploy({ port: process.env.PORT || 3000 });

    // Register platform
    await lti.registerPlatform({
      url: "https://canvas.instructure.com",
      name: "Canvas LMS",
      clientId: process.env.CANVAS_CLIENT_ID,
      authenticationEndpoint: `${process.env.CANVAS_URL}/api/lti/authorize_redirect`,
      accesstokenEndpoint: `${process.env.CANVAS_URL}/login/oauth2/token`,
      authConfig: {
        method: "JWK_SET",
        key: `${process.env.CANVAS_URL}/api/lti/security/jwks`,
      },
    });

    console.log(`Server is running on port ${process.env.PORT || 3000}`);
  } catch (error) {
    console.error("Error during setup:", error);
    process.exit(1);
  }
};

// Start the server
setup();
