'use strict';

/**
 * Edge routing configuration for BlackRoad Pi fleet.
 * Routes billing events and provisioning commands to Pi devices
 * over the WireGuard mesh network.
 */

// Pi fleet device registry — maps device IDs to WireGuard endpoints
const PI_FLEET = {
  'pi-gateway-01': {
    endpoint: process.env.PI_GATEWAY_01 || '10.0.1.1:51820',
    role: 'gateway',
    capabilities: ['billing-relay', 'audit-log'],
  },
  'pi-compute-01': {
    endpoint: process.env.PI_COMPUTE_01 || '10.0.1.2:51820',
    role: 'compute',
    capabilities: ['agent-provision', 'inference'],
  },
  'pi-compute-02': {
    endpoint: process.env.PI_COMPUTE_02 || '10.0.1.3:51820',
    role: 'compute',
    capabilities: ['agent-provision', 'inference'],
  },
  'pi-ledger-01': {
    endpoint: process.env.PI_LEDGER_01 || '10.0.1.4:51820',
    role: 'ledger',
    capabilities: ['roadchain', 'audit-log'],
  },
};

// Routing table: maps billing actions to Pi fleet targets
const ROUTE_TABLE = {
  provision: {
    targets: ['pi-compute-01', 'pi-compute-02'],
    strategy: 'round-robin',
    description: 'New subscription → provision agents on compute nodes',
  },
  deprovision: {
    targets: ['pi-compute-01', 'pi-compute-02'],
    strategy: 'broadcast',
    description: 'Subscription cancelled → tear down agents on all compute nodes',
  },
  update: {
    targets: ['pi-gateway-01'],
    strategy: 'primary',
    description: 'Subscription updated → update gateway routing rules',
  },
  payment_succeeded: {
    targets: ['pi-ledger-01', 'pi-gateway-01'],
    strategy: 'broadcast',
    description: 'Payment confirmed → log to ledger + update gateway',
  },
  payment_failed: {
    targets: ['pi-gateway-01'],
    strategy: 'primary',
    description: 'Payment failed → throttle gateway access',
  },
};

let roundRobinIndex = 0;

function selectTarget(route) {
  switch (route.strategy) {
    case 'round-robin': {
      const target = route.targets[roundRobinIndex % route.targets.length];
      roundRobinIndex++;
      return [target];
    }
    case 'broadcast':
      return [...route.targets];
    case 'primary':
      return [route.targets[0]];
    default:
      return [route.targets[0]];
  }
}

async function routeToFleet(action, payload) {
  const route = ROUTE_TABLE[action];
  if (!route) {
    console.log(`[edge] No route defined for action: ${action}`);
    return { routed: false, action };
  }

  const targets = selectTarget(route);
  const results = [];

  for (const targetId of targets) {
    const device = PI_FLEET[targetId];
    if (!device) {
      console.error(`[edge] Unknown device: ${targetId}`);
      continue;
    }

    console.log(`[edge] Routing ${action} → ${targetId} (${device.endpoint})`);
    results.push({
      deviceId: targetId,
      endpoint: device.endpoint,
      role: device.role,
      payload,
      timestamp: new Date().toISOString(),
    });
  }

  return { routed: true, action, targets: results };
}

function getFleetStatus() {
  return Object.entries(PI_FLEET).map(([id, device]) => ({
    id,
    ...device,
  }));
}

module.exports = { routeToFleet, getFleetStatus, PI_FLEET, ROUTE_TABLE, selectTarget };
