import { Router } from "express";
import { UserController } from "@/controllers/user.controller";
import { UserService } from "@/services/user.service";
import { validateRequest } from "@/middleware/validateRequest";
import { requireAuth, requireRole } from "@/middleware/authMiddleware";
import {
  createUserSchema,
  updateUserSchema,
} from "@/validators/user.validator";
import { cache } from "@/middleware/cacheMiddleware";

const router = Router();
const userService = new UserService();
const userController = new UserController(userService);

/**
 * @swagger
 * tags:
 *   name: Users
 *   description: User management endpoints
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     User:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           format: uuid
 *         name:
 *           type: string
 *         email:
 *           type: string
 *           format: email
 *         role:
 *           type: string
 *           enum: [ADMIN, USER]
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 */

// Protected routes - all routes require authentication
router.use(requireAuth);

/**
 * @swagger
 * /users:
 *   get:
 *     summary: Get all users (Admin only)
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of users
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/User'
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Admin only
 */
router.get(
  "/",
  requireRole(["ADMIN"]),
  cache({ duration: 300 }), // Cache for 5 minutes
  userController.getAll
);

/**
 * @swagger
 * /users/{id}:
 *   get:
 *     summary: Get user by ID
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: User details
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/User'
 *       404:
 *         description: User not found
 */
router.get(
  "/:id",
  cache({ duration: 60 }), // Cache for 1 minute
  userController.getUser
);

/**
 * @swagger
 * /users:
 *   post:
 *     summary: Create new user (Admin only)
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - email
 *               - password
 *             properties:
 *               name:
 *                 type: string
 *                 minLength: 2
 *               email:
 *                 type: string
 *                 format: email
 *               password:
 *                 type: string
 *                 format: password
 *                 minLength: 8
 *               role:
 *                 type: string
 *                 enum: [ADMIN, USER]
 *     responses:
 *       201:
 *         description: User created
 *       400:
 *         description: Invalid input
 *       403:
 *         description: Forbidden - Admin only
 */
router.post(
  "/",
  requireRole(["ADMIN"]),
  validateRequest(createUserSchema),
  userController.create
);

/**
 * @swagger
 * /users/{id}:
 *   patch:
 *     summary: Update user (Admin only)
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 minLength: 2
 *               email:
 *                 type: string
 *                 format: email
 *               role:
 *                 type: string
 *                 enum: [ADMIN, USER]
 *     responses:
 *       200:
 *         description: User updated
 *       400:
 *         description: Invalid input
 *       403:
 *         description: Forbidden - Admin only
 *       404:
 *         description: User not found
 */
router.patch(
  "/:id",
  requireRole(["ADMIN"]),
  validateRequest(updateUserSchema),
  userController.update
);

/**
 * @swagger
 * /users/{id}:
 *   delete:
 *     summary: Delete user (Admin only)
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: User deleted
 *       403:
 *         description: Forbidden - Admin only
 *       404:
 *         description: User not found
 */
router.delete("/:id", requireRole(["ADMIN"]), userController.delete);

export default router;
