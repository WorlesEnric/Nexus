/**
 * TriLog TypeScript SDK Example: Shopping Cart
 *
 * This example demonstrates:
 * 1. Defining TriLog schemas with decorators
 * 2. Exporting registry for validation
 * 3. Initializing OpenTelemetry
 * 4. Using anchor context to bind logs to objects
 * 5. Emitting state changes and events
 */

import {
  TrilogObject,
  TrilogProcess,
  field,
  Registry,
  setupOtelLocal,
  anchor,
  createLogger,
} from '../src';

// ============================================================================
// 1. Define Schemas
// ============================================================================

/**
 * Shopping Cart Object
 */
class ShoppingCart extends TrilogObject {
  @field.integer({ default: 0 })
  itemCount: number = 0;

  @field.float({ default: 0.0 })
  totalValue: number = 0.0;

  @field.string({ default: 'active' })
  status: string = 'active';

  @field.timestamp()
  lastModified?: Date;
}

/**
 * User Object
 */
class User extends TrilogObject {
  @field.string({ required: true })
  email!: string;

  @field.string({ required: true })
  name!: string;

  @field.integer({ default: 0 })
  totalPurchases: number = 0;

  @field.boolean({ default: false })
  isPremium: boolean = false;
}

/**
 * Checkout Process
 */
class CheckoutFlow extends TrilogProcess {
  @field.string()
  paymentMethod: string = '';

  @field.string({ default: 'pending' })
  paymentStatus: string = 'pending';

  @field.float({ default: 0.0 })
  totalAmount: number = 0.0;
}

// ============================================================================
// 2. Export Registry
// ============================================================================

const registry = new Registry('shopping-app', '1.0.0');
registry.register(ShoppingCart);
registry.register(User);
registry.register(CheckoutFlow);

console.log('='.repeat(60));
console.log('Registry Export:');
console.log('='.repeat(60));
console.log(registry.export());
console.log('');

// Save registry to file (optional)
// fs.writeFileSync('registry.json', registry.export());

// ============================================================================
// 3. Initialize OpenTelemetry
// ============================================================================

console.log('='.repeat(60));
console.log('Initializing OpenTelemetry...');
console.log('='.repeat(60));

setupOtelLocal('shopping-app');

// For Kubernetes deployment, use:
// setupOtelKubernetes('shopping-app');
// Or:
// setupOtel({
//   serviceName: 'shopping-app',
//   collectorEndpoint: 'http://trilog-otel-collector.trilog-system.svc.cluster.local:4317',
//   environment: 'production',
// });

console.log('OpenTelemetry initialized successfully\n');

// ============================================================================
// 4. Use TriLog in Application Code
// ============================================================================

const logger = createLogger('shopping-cart-service');

/**
 * Simulate adding items to a cart
 */
async function addItemsToCart(cartId: string, items: number): Promise<void> {
  // All logs within this anchor are automatically tagged with cart_id
  anchor(cartId, ShoppingCart, () => {
    console.log(`\n[Cart ${cartId}] Adding ${items} items...`);

    // Log state changes
    logger.stateChange({
      itemCount: items,
      totalValue: items * 29.99,
      lastModified: new Date(),
    });

    // Log domain event
    logger.event('items_added', {
      quantity: items,
      source: 'web',
    });

    logger.info(`Successfully added ${items} items to cart`);
  });
}

/**
 * Simulate checkout process
 */
async function checkout(cartId: string, userId: string): Promise<void> {
  const processId = `checkout_${Date.now()}`;

  // Anchor to the checkout process
  anchor(processId, CheckoutFlow, () => {
    console.log(`\n[Checkout ${processId}] Starting checkout for cart ${cartId}...`);

    // Phase 1: Validate cart
    logger.action('validate_cart', { cartId });
    logger.stateChange({ paymentStatus: 'validating' });

    // Phase 2: Process payment
    logger.action('process_payment', {
      cartId,
      userId,
      method: 'credit_card',
    });
    logger.stateChange({
      paymentMethod: 'credit_card',
      paymentStatus: 'processing',
      totalAmount: 89.97,
    });

    // Simulate payment success
    setTimeout(() => {
      logger.stateChange({ paymentStatus: 'completed' });
      logger.event('payment_completed', {
        cartId,
        amount: 89.97,
      });

      // Update cart status
      anchor(cartId, ShoppingCart, () => {
        logger.stateChange({ status: 'completed' });
        logger.event('cart_completed');
      });

      // Update user stats
      anchor(userId, User, () => {
        logger.stateChange({ totalPurchases: 1 });
        logger.event('purchase_completed', {
          amount: 89.97,
        });
      });

      logger.info('Checkout completed successfully');
    }, 100);
  });
}

/**
 * Simulate user registration
 */
async function registerUser(userId: string, email: string, name: string): Promise<void> {
  anchor(userId, User, () => {
    console.log(`\n[User ${userId}] Registering new user...`);

    logger.stateChange({
      email,
      name,
      totalPurchases: 0,
      isPremium: false,
    });

    logger.event('user_registered', {
      email,
      registrationSource: 'web',
    });

    logger.info(`User ${email} registered successfully`);
  });
}

// ============================================================================
// 5. Run Example Workflow
// ============================================================================

async function runExample() {
  console.log('\n' + '='.repeat(60));
  console.log('Running Shopping Cart Example');
  console.log('='.repeat(60));

  const userId = 'user_123';
  const cartId = 'cart_456';

  try {
    // Step 1: Register user
    await registerUser(userId, 'alice@example.com', 'Alice Smith');

    // Wait a bit
    await new Promise(resolve => setTimeout(resolve, 200));

    // Step 2: Add items to cart
    await addItemsToCart(cartId, 3);

    // Wait a bit
    await new Promise(resolve => setTimeout(resolve, 200));

    // Step 3: Checkout
    await checkout(cartId, userId);

    // Wait for async operations
    await new Promise(resolve => setTimeout(resolve, 500));

    console.log('\n' + '='.repeat(60));
    console.log('Example completed successfully!');
    console.log('='.repeat(60));
    console.log('\nAll logs have been sent to the TriLog collector.');
    console.log('You can now query them using the TriLog query engine.\n');

    // Give time for logs to be sent
    await new Promise(resolve => setTimeout(resolve, 2000));

  } catch (error) {
    console.error('Error in example:', error);
  } finally {
    // Shutdown OpenTelemetry
    process.exit(0);
  }
}

// Run the example
runExample();
