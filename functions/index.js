const functions = require("firebase-functions"); // Import v1 of Firebase functions
const admin = require("firebase-admin");
const nodemailer = require("nodemailer");

admin.initializeApp();

// Access environment variables
const emailUser = functions.config().email.user;
const emailPass = functions.config().email.pass;

// Configure nodemailer transporter for email notifications
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: emailUser, // Replace with your email
        pass: emailPass // Replace with your email password or use an App Password
    }
});

// Scheduled Function: Send FCM deadline notifications every minute
exports.sendDeadlineNotification = functions.pubsub.schedule('every 1 minutes').onRun(async (context) => {
    const now = new Date();
    const fiveMinutesLater = new Date(now.getTime() + 5 * 60 * 1000); // 5 minutes from now

    try {
        // Query todos with deadlines in the next 5 minutes
        const todosQuery = await admin.firestore()
            .collection("todos")
            .where("completed", "==", false) // Only get incomplete todos
            .get();

        if (todosQuery.empty) {
            console.log("No todos with upcoming deadlines.");
            return;
        }

        // Loop through each todo and check if it's due within 5 minutes
        todosQuery.forEach(async (todoDoc) => {
            const todo = todoDoc.data();
            const deadline = new Date(todo.deadline); // Parse the deadline string into a Date object

            // Check if the deadline is within the next 5 minutes
            if (deadline > now && deadline <= fiveMinutesLater) {
                // Fetch the user document using the userId from the todo document
                const userDoc = await admin.firestore().collection("users").doc(todo.userId).get();

                if (!userDoc.exists) {
                    console.log("User document not found for todo:", todoDoc.id);
                    return;
                }

                const userData = userDoc.data();
                const userToken = userData.token; // Retrieve the token field from the user document

                // Send FCM notification if user token is found
                if (userToken) {
                    const message = {
                        token: userToken,
                        notification: {
                            title: "Todo Deadline Approaching!",
                            body: `Your task "${todo.title}" is due in less than 5 minutes!`,
                        },
                        android: {
                            notification: {
                                sound: "default",
                            },
                        },
                    };

                    try {
                        const response = await admin.messaging().send(message);
                        console.log("Notification sent successfully:", response);
                    } catch (error) {
                        console.error("Error sending notification:", error);
                    }
                } else {
                    console.log("No token found for user with userId:", todo.userId);
                }
            }
        });
    } catch (error) {
        console.error("Error sending notification:", error);
    }
});

// Firestore Trigger: Send email when a new task is added
exports.newSendEmailOnTaskAdd = functions.firestore.document('todos/{todoId}').onCreate(async (snapshot, context) => {
    const newTodo = snapshot.data(); // The newly added task
    const userId = newTodo.userId;

    try {
        // Fetch the user document using the userId from the todo document
        const userDoc = await admin.firestore().collection("users").doc(userId).get();

        if (!userDoc.exists) {
            console.log("User document not found for userId:", userId);
            return;
        }

        const userData = userDoc.data();
        const userEmail = userData.email; // Retrieve the email from the user document

        // Send email notification if user email is found
        if (userEmail) {
            const mailOptions = {
                from: emailUser, // Your email address
                to: userEmail,
                subject: "New Task Added on DotList!",
                text: `You have successfully added a new task: "${newTodo.title}".`
            };

            try {
                const info = await transporter.sendMail(mailOptions);
                console.log('Email sent successfully:', info.response);
            } catch (emailError) {
                console.error('Error sending email:', emailError);
            }
        } else {
            console.log("No email found for userId:", userId);
        }
    } catch (error) {
        console.error("Error sending email:", error);
    }
});
