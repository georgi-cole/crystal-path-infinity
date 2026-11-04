import { createLockedEdgeHandler } from '../../../packages/server-core/src/supabase-edge.ts';

// Deployable locked entry: no email intake, JWT exchange, profile writes, ranked
// starts or ad callbacks are installed merely by deploying an Edge Function.
// An approved policy/revocation service and durable limiter must be integrated in
// a subsequent reviewed entry before createApprovedEdgeServices may be injected.
Deno.serve(createLockedEdgeHandler((name) => Deno.env.get(name)));
