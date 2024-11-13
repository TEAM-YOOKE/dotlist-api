const { onSchedule } = require("firebase-functions/v2/scheduler");
const admin = require("firebase-admin");

admin.initializeApp();

exports.sendDeadlineNotification = onSchedule("every 1 minutes", async () => {
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

                    // Send notification using the v1 API with the new method `send()`
                    const response = await admin.messaging().send(message);
                    console.log("Notification sent successfully:", response);
                } else {
                    console.log("No token found for user with userId:", todo.userId);
                }
            }
        });
    } catch (error) {
        console.error("Error sending notification:", error);
    }
});
