# TriLog TypeScript SDK

Model-Driven Observability for TypeScript applications. Track object state changes, events, and workflows with time-travel capabilities.

## Installation

```bash
npm install @trilog/sdk
# or
yarn add @trilog/sdk
# or
pnpm add @trilog/sdk
```

## Quick Start

### 1. Define Your Schemas

Use decorators to define the objects you want to track:

```typescript
import { TrilogObject, field } from '@trilog/sdk';

class ShoppingCart extends TrilogObject {
  @field.integer({ default: 0 })
  itemCount: number = 0;

  @field.float({ default: 0.0 })
  totalValue: number = 0.0;

  @field.string({ default: 'active' })
  status: string = 'active';
}
```

### 2. Initialize OpenTelemetry

```typescript
import { setupOtel } from '@trilog/sdk';

// For local development
setupOtel({
  serviceName: 'my-app',
  collectorEndpoint: 'http://localhost:4317',
  enableConsoleExporter: true, // Debug mode
});

// For Kubernetes
setupOtel({
  serviceName: 'my-app',
  collectorEndpoint: 'http://trilog-otel-collector.trilog-system.svc.cluster.local:4317',
  environment: 'production',
});
```

### 3. Use Anchor Context and Log

```typescript
import { anchor, createLogger } from '@trilog/sdk';

const logger = createLogger('cart-service');

// All logs within anchor are automatically tagged with cart_123
anchor('cart_123', ShoppingCart, () => {
  // Log state changes
  logger.stateChange({
    itemCount: 5,
    totalValue: 99.99,
  });

  // Log domain events
  logger.event('item_added', {
    sku: 'WIDGET-001',
    quantity: 2,
  });

  // Standard logging
  logger.info('Cart updated successfully');
});
```

## Core Concepts

### Objects

Objects represent stateful entities you want to track over time:

```typescript
class User extends TrilogObject {
  @field.string({ required: true })
  email!: string;

  @field.integer({ default: 0 })
  loginCount: number = 0;

  @field.boolean({ default: false })
  isVerified: boolean = false;
}
```

### Processes

Processes represent workflows or distributed operations:

```typescript
import { TrilogProcess } from '@trilog/sdk';

class CheckoutFlow extends TrilogProcess {
  @field.string()
  paymentMethod: string = '';

  @field.string({ default: 'pending' })
  status: string = 'pending';
}
```

### Anchor Context

Anchor binds all logs within a scope to a specific object:

```typescript
// Simple usage
anchor('user_123', User, () => {
  logger.stateChange({ loginCount: 1 });
});

// Nested anchors (for relationships)
anchor('order_456', Order, () => {
  logger.stateChange({ status: 'processing' });

  anchor('user_123', User, () => {
    logger.event('order_placed', { orderId: 'order_456' });
  });
});

// With async functions
await anchor('cart_789', ShoppingCart, async () => {
  await addItemsToCart();
  logger.stateChange({ itemCount: 3 });
});
```

### Decorator Version

For class methods, use the `@anchored` decorator:

```typescript
import { anchored } from '@trilog/sdk';

class CartService {
  @anchored('cartId', ShoppingCart)
  async addItem(cartId: string, item: Item) {
    // All logs here are automatically anchored to cartId
    logger.stateChange({ itemCount: this.getItemCount() });
    logger.event('item_added', { sku: item.sku });
  }
}
```

## Logging Methods

### State Changes

Log when object fields are modified:

```typescript
logger.stateChange({
  field1: newValue1,
  field2: newValue2,
});
```

### Domain Events

Log significant events:

```typescript
logger.event('payment_completed', {
  amount: 99.99,
  method: 'credit_card',
});
```

### Actions/Commands

Log operations being executed:

```typescript
logger.action('send_notification', {
  recipient: 'user@example.com',
  type: 'email',
});
```

### Standard Logging

```typescript
logger.info('Operation completed');
logger.debug('Debug information', { details: '...' });
logger.warn('Warning message');
logger.error('Error occurred', error);
```

## Field Types

Available field decorators:

```typescript
@field.integer({ default: 0, minValue: 0, maxValue: 100 })
count: number;

@field.float({ default: 0.0 })
price: number;

@field.string({ maxLength: 255 })
name: string;

@field.boolean({ default: false })
isActive: boolean;

@field.timestamp()
createdAt: Date;

@field.list()
tags: string[];

@field.dict()
metadata: Record<string, any>;

@field.reference()  // For foreign keys
userId: string;
```

## Registry Export

Export your schema for validation and type generation:

```typescript
import { Registry } from '@trilog/sdk';

const registry = new Registry('my-app', '1.0.0');
registry.register(ShoppingCart);
registry.register(User);
registry.register(CheckoutFlow);

// Export to JSON (compatible with Python SDK)
const jsonSchema = registry.export();
console.log(jsonSchema);

// Save to file
import fs from 'fs';
fs.writeFileSync('registry.json', registry.export());
```

## Integration Patterns

### Express.js Middleware

```typescript
import express from 'express';
import { anchor, createLogger } from '@trilog/sdk';

const app = express();
const logger = createLogger('api');

app.use((req, res, next) => {
  // Anchor all logs in this request to the user
  const userId = req.user?.id;
  if (userId) {
    anchor(userId, User, () => next());
  } else {
    next();
  }
});

app.post('/cart/add', (req, res) => {
  const { cartId, item } = req.body;

  anchor(cartId, ShoppingCart, () => {
    logger.stateChange({ itemCount: getItemCount(cartId) });
    logger.event('item_added', { sku: item.sku });
    res.json({ success: true });
  });
});
```

### NestJS Service

```typescript
import { Injectable } from '@nestjs/common';
import { anchor, createLogger } from '@trilog/sdk';

@Injectable()
export class CartService {
  private logger = createLogger('cart-service');

  async addItem(cartId: string, item: Item): Promise<void> {
    await anchor(cartId, ShoppingCart, async () => {
      // Your business logic
      await this.repository.addItem(cartId, item);

      // Log state change
      this.logger.stateChange({
        itemCount: await this.getItemCount(cartId),
      });

      this.logger.event('item_added', { sku: item.sku });
    });
  }
}
```

### Background Jobs

```typescript
import { anchor, createLogger } from '@trilog/sdk';

const logger = createLogger('background-worker');

async function processOrder(orderId: string) {
  await anchor(orderId, Order, async () => {
    logger.stateChange({ status: 'processing' });

    try {
      await fulfillOrder(orderId);
      logger.stateChange({ status: 'completed' });
      logger.event('order_fulfilled');
    } catch (error) {
      logger.stateChange({ status: 'failed' });
      logger.error('Order processing failed', error);
    }
  });
}
```

## Kubernetes Deployment

### Using Port-Forward (Development)

```bash
# Forward OTel Collector port
kubectl port-forward -n trilog-system svc/trilog-otel-collector 4317:4317

# Then use localhost endpoint
setupOtel({
  serviceName: 'my-app',
  collectorEndpoint: 'http://localhost:4317',
});
```

### Using Service DNS (Production)

```typescript
setupOtel({
  serviceName: 'my-app',
  collectorEndpoint: 'http://trilog-otel-collector.trilog-system.svc.cluster.local:4317',
  environment: process.env.NODE_ENV || 'production',
});
```

### Environment Variables

```yaml
# k8s deployment
env:
  - name: TRILOG_COLLECTOR_ENDPOINT
    value: "http://trilog-otel-collector.trilog-system.svc.cluster.local:4317"
  - name: NODE_ENV
    value: "production"
```

```typescript
// In your code
setupOtel({
  serviceName: 'my-app',
  collectorEndpoint: process.env.TRILOG_COLLECTOR_ENDPOINT || 'http://localhost:4317',
  environment: process.env.NODE_ENV || 'development',
});
```

## Best Practices

### 1. Define Schemas Early

Define your TriLog schemas alongside your domain models:

```typescript
// domain/cart.ts
export class ShoppingCart extends TrilogObject {
  @field.integer({ default: 0 })
  itemCount: number = 0;
  // ...
}
```

### 2. Use Meaningful Object IDs

Use stable, meaningful IDs (not database auto-increments):

```typescript
// Good
const cartId = `cart_${userId}_${Date.now()}`;
anchor(cartId, ShoppingCart, () => { ... });

// Avoid
const cartId = Math.random().toString();  // Hard to query later
```

### 3. Log State Changes, Not Getters

Log actual changes, not every read:

```typescript
// Good - log when modifying
function addItem(cartId: string, item: Item) {
  anchor(cartId, ShoppingCart, () => {
    cart.items.push(item);
    logger.stateChange({ itemCount: cart.items.length });
  });
}

// Avoid - logging every getter
function getItemCount(cartId: string) {
  logger.stateChange({ itemCount: cart.items.length });  // Too noisy!
}
```

### 4. Use Events for Business Moments

Use events for significant business occurrences:

```typescript
// Good - captures intent
logger.event('checkout_completed', { amount: total });

// Less useful
logger.info('Status changed to completed');
```

### 5. Anchor at the Right Level

Anchor at the request/operation level, not too granular:

```typescript
// Good - anchor once per request
app.post('/cart/add', (req, res) => {
  anchor(req.body.cartId, ShoppingCart, () => {
    addItem(req.body.item);
    updateTotals();
    res.json({ success: true });
  });
});

// Avoid - re-anchoring repeatedly
function addItem(cartId, item) {
  anchor(cartId, ShoppingCart, () => { ... });  // Already anchored!
}
```

## TypeScript Configuration

Ensure your `tsconfig.json` has decorator support:

```json
{
  "compilerOptions": {
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true
  }
}
```

## Examples

See the `examples/` directory for complete examples:
- `shopping-cart.ts` - E-commerce cart tracking
- More examples coming soon!

## API Reference

### Core Classes

- `TrilogObject` - Base class for stateful entities
- `TrilogProcess` - Base class for workflows
- `Registry` - Schema registry management
- `TriLogLogger` - Logging interface

### Functions

- `setupOtel(options)` - Initialize OpenTelemetry
- `setupOtelKubernetes(serviceName, namespace?)` - K8s quick setup
- `setupOtelLocal(serviceName)` - Local development setup
- `anchor(objId, objType, fn)` - Context anchoring
- `createLogger(name)` - Create logger instance

### Decorators

- `@field.integer(options?)` - Integer field
- `@field.float(options?)` - Float field
- `@field.string(options?)` - String field
- `@field.boolean(options?)` - Boolean field
- `@field.timestamp(options?)` - Timestamp field
- `@field.list(options?)` - List field
- `@field.dict(options?)` - Dictionary field
- `@anchored(paramName, objType)` - Method decorator

## Troubleshooting

### Logs not appearing in TriLog

1. Check OTel Collector is running:
   ```bash
   kubectl get pods -n trilog-system
   ```

2. Verify endpoint is correct:
   ```typescript
   setupOtel({
     serviceName: 'my-app',
     collectorEndpoint: 'http://localhost:4317',  // Check this!
     enableConsoleExporter: true,  // Enable debug output
   });
   ```

3. Check anchor context is set:
   ```typescript
   import { getCurrentAnchor } from '@trilog/sdk';

   // Inside your code
   const anchor = getCurrentAnchor();
   console.log('Current anchor:', anchor);  // Should not be undefined
   ```

### TypeScript Compilation Errors

Ensure decorators are enabled in `tsconfig.json`:
```json
{
  "experimentalDecorators": true,
  "emitDecoratorMetadata": true
}
```

## License

MIT

## Contributing

Contributions welcome! Please see CONTRIBUTING.md for details.

## Support

- GitHub Issues: https://github.com/yourusername/trilog/issues
- Documentation: https://trilog-docs.example.com
- Community: https://discord.gg/trilog
