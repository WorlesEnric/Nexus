import express, { Request, Response, NextFunction, Router } from 'express';
import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';

// Extend Express Request type to include user
declare global {
  namespace Express {
    interface Request {
      user?: {
        userId: string;
        email: string;
      };
    }
  }
}

/**
 * Auth middleware to verify JWT tokens
 */
export function createAuthMiddleware(jwtSecret: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      res.status(401).json({ error: 'No authorization token provided' });
      return;
    }

    const token = authHeader.replace('Bearer ', '');

    try {
      const decoded = jwt.verify(token, jwtSecret) as { userId: string; email: string };
      req.user = decoded;
      next();
    } catch (error) {
      res.status(401).json({ error: 'Invalid or expired token' });
      return;
    }
  };
}

/**
 * Creates the marketplace router with all API endpoints
 */
export function createMarketplaceRouter(prisma: PrismaClient, jwtSecret: string): Router {
  const router = express.Router();
  const authMiddleware = createAuthMiddleware(jwtSecret);

  /**
   * GET /marketplace/panels
   * Browse marketplace - get all published panels
   * Query params: category, search, type, sort
   */
  router.get('/panels', async (req: Request, res: Response): Promise<void> => {
    try {
      const { category, search, type, sort } = req.query;

      const panels = await prisma.panel.findMany({
        where: {
          visibility: 'published',
          ...(category && { category: category as string }),
          ...(type && { type: type as string }),
          ...(search && {
            OR: [
              { name: { contains: search as string } },
              { description: { contains: search as string } },
              { tags: { contains: search as string } },
            ],
          }),
        },
        include: {
          author: {
            select: {
              id: true,
              fullName: true,
              email: true,
            },
          },
          _count: {
            select: {
              installations: true,
              reviews: true,
            },
          },
        },
        orderBy:
          sort === 'popular'
            ? { installCount: 'desc' }
            : sort === 'recent'
            ? { createdAt: 'desc' }
            : sort === 'rating'
            ? { averageRating: 'desc' }
            : { name: 'asc' },
      });

      res.json({ panels, count: panels.length });
    } catch (error) {
      console.error('Error fetching panels:', error);
      res.status(500).json({ error: 'Failed to fetch panels' });
    }
  });

  /**
   * GET /marketplace/panels/:id
   * Get detailed information about a specific panel
   */
  router.get('/panels/:id', async (req: Request, res: Response): Promise<void> => {
    try {
      const id = req.params.id as string;

      const panel = await prisma.panel.findUnique({
        where: { id },
        include: {
          author: {
            select: {
              id: true,
              fullName: true,
              email: true,
            },
          },
          versions: {
            orderBy: { createdAt: 'desc' },
            take: 10, // Last 10 versions
          },
          customComponents: true,
          reviews: {
            include: {
              user: {
                select: {
                  fullName: true,
                },
              },
            },
            orderBy: { createdAt: 'desc' },
            take: 20, // Last 20 reviews
          },
          _count: {
            select: {
              installations: true,
              reviews: true,
            },
          },
        },
      });

      if (!panel) {
        res.status(404).json({ error: 'Panel not found' });
        return;
      }

      res.json({ panel });
    } catch (error) {
      console.error('Error fetching panel:', error);
      res.status(500).json({ error: 'Failed to fetch panel details' });
    }
  });

  /**
   * POST /marketplace/panels/:id/install
   * Install a panel for the current user
   * Requires authentication
   */
  router.post('/panels/:id/install', authMiddleware, async (req: Request, res: Response): Promise<void> => {
    try {
      const id = req.params.id as string;
      const userId = req.user!.userId;

      // Check if panel exists
      const panel = await prisma.panel.findUnique({ where: { id } });

      if (!panel) {
        res.status(404).json({ error: 'Panel not found' });
        return;
      }

      // Check if already installed
      const existing = await prisma.installation.findUnique({
        where: {
          userId_panelId: {
            userId,
            panelId: id,
          },
        },
      });

      if (existing) {
        res.json({
          installation: existing,
          alreadyInstalled: true,
          message: 'Panel is already installed',
        });
        return;
      }

      // Create installation
      const installation = await prisma.installation.create({
        data: {
          userId,
          panelId: id,
          version: panel.version,
          isActive: true,
        },
        include: {
          panel: {
            select: {
              id: true,
              name: true,
              description: true,
              icon: true,
              accentColor: true,
              nxmlSource: true,
            },
          },
        },
      });

      // Increment install count
      await prisma.panel.update({
        where: { id },
        data: {
          installCount: {
            increment: 1,
          },
        },
      });

      res.json({
        installation,
        alreadyInstalled: false,
        message: 'Panel installed successfully',
      });
    } catch (error) {
      console.error('Error installing panel:', error);
      res.status(500).json({ error: 'Failed to install panel' });
    }
  });

  /**
   * GET /marketplace/my-panels
   * Get all panels installed by the current user
   * Requires authentication
   */
  router.get('/my-panels', authMiddleware, async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user!.userId;

      const installations = await prisma.installation.findMany({
        where: {
          userId,
          isActive: true,
        },
        include: {
          panel: {
            include: {
              author: {
                select: {
                  fullName: true,
                },
              },
            },
          },
        },
        orderBy: { installedAt: 'desc' },
      });

      res.json({ installations, count: installations.length });
    } catch (error) {
      console.error('Error fetching user panels:', error);
      res.status(500).json({ error: 'Failed to fetch installed panels' });
    }
  });

  /**
   * DELETE /marketplace/my-panels/:panelId
   * Uninstall a panel (mark as inactive)
   * Requires authentication
   */
  router.delete('/my-panels/:panelId', authMiddleware, async (req: Request, res: Response): Promise<void> => {
    try {
      const panelId = req.params.panelId as string;
      const userId = req.user!.userId;

      const installation = await prisma.installation.findUnique({
        where: {
          userId_panelId: {
            userId,
            panelId,
          },
        },
      });

      if (!installation) {
        res.status(404).json({ error: 'Installation not found' });
        return;
      }

      // Mark as inactive instead of deleting
      await prisma.installation.update({
        where: {
          userId_panelId: {
            userId,
            panelId,
          },
        },
        data: {
          isActive: false,
        },
      });

      // Decrement install count
      await prisma.panel.update({
        where: { id: panelId },
        data: {
          installCount: {
            decrement: 1,
          },
        },
      });

      res.json({ message: 'Panel uninstalled successfully' });
    } catch (error) {
      console.error('Error uninstalling panel:', error);
      res.status(500).json({ error: 'Failed to uninstall panel' });
    }
  });

  /**
   * POST /marketplace/panels
   * Publish a new panel
   * Requires authentication
   */
  router.post('/panels', authMiddleware, async (req: Request, res: Response): Promise<void> => {
    try {
      const { name, description, category, icon, accentColor, nxmlSource, tags, hasCustomComponents } =
        req.body;
      const userId = req.user!.userId;

      // Validate required fields
      if (!name || !description || !category || !nxmlSource) {
        res.status(400).json({
          error: 'Missing required fields: name, description, category, nxmlSource',
        });
        return;
      }

      // Create panel
      const panel = await prisma.panel.create({
        data: {
          name,
          description,
          category,
          icon: icon || 'Box',
          accentColor: accentColor || 'violet',
          nxmlSource,
          tags: tags || '',
          hasCustomComponents: hasCustomComponents || false,
          authorId: userId,
          version: '1.0.0',
          type: 'free', // Default to free
          visibility: 'draft', // Default to draft
          installCount: 0,
        },
      });

      // Create first version
      await prisma.panelVersion.create({
        data: {
          panelId: panel.id,
          version: '1.0.0',
          nxmlSource,
          changelog: 'Initial version',
        },
      });

      res.status(201).json({
        panel,
        message: 'Panel created successfully. Set visibility to "published" to make it available in the marketplace.',
      });
    } catch (error) {
      console.error('Error creating panel:', error);
      res.status(500).json({ error: 'Failed to create panel' });
    }
  });

  /**
   * PATCH /marketplace/panels/:id
   * Update a panel (only by author)
   * Requires authentication
   */
  router.patch('/panels/:id', authMiddleware, async (req: Request, res: Response): Promise<void> => {
    try {
      const id = req.params.id as string;
      const userId = req.user!.userId;
      const { name, description, category, icon, accentColor, nxmlSource, tags, visibility, version } =
        req.body;

      // Check if panel exists and user is the author
      const panel = await prisma.panel.findUnique({ where: { id } });

      if (!panel) {
        res.status(404).json({ error: 'Panel not found' });
        return;
      }

      if (panel.authorId !== userId) {
        res.status(403).json({ error: 'You can only update your own panels' });
        return;
      }

      // Update panel
      const updatedPanel = await prisma.panel.update({
        where: { id },
        data: {
          ...(name && { name }),
          ...(description && { description }),
          ...(category && { category }),
          ...(icon && { icon }),
          ...(accentColor && { accentColor }),
          ...(nxmlSource && { nxmlSource }),
          ...(tags !== undefined && { tags }),
          ...(visibility && { visibility }),
          ...(version && { version }),
        },
      });

      // If NXML source or version changed, create a new version entry
      if (nxmlSource || version) {
        const newVersion = version || panel.version;

        await prisma.panelVersion.create({
          data: {
            panelId: id,
            version: newVersion,
            nxmlSource: nxmlSource || panel.nxmlSource,
            changelog: req.body.changelog || 'Updated version',
          },
        });
      }

      res.json({ panel: updatedPanel, message: 'Panel updated successfully' });
    } catch (error) {
      console.error('Error updating panel:', error);
      res.status(500).json({ error: 'Failed to update panel' });
    }
  });

  /**
   * POST /marketplace/panels/:id/reviews
   * Submit or update a review for a panel
   * Requires authentication
   */
  router.post('/panels/:id/reviews', authMiddleware, async (req: Request, res: Response): Promise<void> => {
    try {
      const id = req.params.id as string;
      const { rating, comment } = req.body;
      const userId = req.user!.userId;

      // Validate rating
      if (!rating || rating < 1 || rating > 5) {
        res.status(400).json({ error: 'Rating must be between 1 and 5' });
        return;
      }

      // Check if panel exists
      const panel = await prisma.panel.findUnique({ where: { id } });

      if (!panel) {
        res.status(404).json({ error: 'Panel not found' });
        return;
      }

      // Upsert review
      const review = await prisma.review.upsert({
        where: {
          userId_panelId: {
            userId,
            panelId: id,
          },
        },
        create: {
          userId,
          panelId: id,
          rating,
          comment: comment || null,
        },
        update: {
          rating,
          comment: comment || null,
        },
        include: {
          user: {
            select: {
              fullName: true,
            },
          },
        },
      });

      // Recalculate average rating
      const reviews = await prisma.review.findMany({
        where: { panelId: id },
        select: { rating: true },
      });

      const averageRating = reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length;

      await prisma.panel.update({
        where: { id },
        data: { averageRating },
      });

      res.json({
        review,
        message: 'Review submitted successfully',
        averageRating,
      });
    } catch (error) {
      console.error('Error submitting review:', error);
      res.status(500).json({ error: 'Failed to submit review' });
    }
  });

  /**
   * GET /marketplace/categories
   * Get all available panel categories with counts
   */
  router.get('/categories', async (req: Request, res: Response): Promise<void> => {
    try {
      const categories = await prisma.panel.groupBy({
        by: ['category'],
        where: {
          visibility: 'published',
        },
        _count: {
          id: true,
        },
      });

      const formattedCategories = categories.map((cat) => ({
        name: cat.category,
        count: cat._count.id,
      }));

      res.json({ categories: formattedCategories });
    } catch (error) {
      console.error('Error fetching categories:', error);
      res.status(500).json({ error: 'Failed to fetch categories' });
    }
  });

  return router;
}
