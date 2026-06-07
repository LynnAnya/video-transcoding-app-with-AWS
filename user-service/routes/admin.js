const express = require('express');
const router = express.Router();
const { getAllUsers, deleteUser, getVideos, deleteVideo } = require("../dynamodb");

// 1. Fetch display all users from DB 
router.get('/users', async (req, res) => {
    try {
        const users = await getAllUsers();
        res.status(200).json(users);
    } catch (err) {
        console.error('Error fetching users:', err);
        res.status(500).send('Internal Server Error');
    }
});
// 2. DELETE user 
router.delete('/users/:username', async (req, res) => {
    try {
        const { username } = req.params;
        await deleteUser(username); 
        res.status(200).send(`User ${username} deleted successfully!`);
    } catch (err) {
        console.error('Error deleting user:', err);
        res.status(500).send('Failed to delete user');
    }
});
// 3. fetch display user's videos 
router.get('/videosData/:username', async (req, res) => {
    const username = req.params.username; 
    try {
        const videos = await getVideos(username);
        res.json(videos);
    } catch (error) {
        console.error('Error getting videos for user:', username, error);
        res.status(500).json({ error: 'Error retrieving videos for this user.' });
    }
});
// 4. DELETE user's video 
router.delete('/videos/:videoid', async (req, res) => {
    const { videoid } = req.params; 
    try {
        await deleteVideo(videoid);
        res.status(200).json({ message: `Video with ID ${videoid} deleted successfully` });
    } catch (error) {
        console.error(`Error deleting video with ID ${videoid}:`, error);
        res.status(500).json({ error: 'Failed to delete the video. Please try again later.' });
    }
});
module.exports = router;