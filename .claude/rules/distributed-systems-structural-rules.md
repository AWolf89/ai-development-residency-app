# Structural Rules for Data Flow, State Persistence, and Modular Boundaries

Modern distributed systems trade single-process simplicity for organizational autonomy, horizontal scalability, and fault tolerance. However, decoupling systems across network boundaries introduces fundamental failure modes: partial network partitions, process crashes, out-of-order delivery, and concurrent state mutation. Preserving system integrity under these conditions requires strict architectural invariants across service boundaries, background workers, and storage engines.

This technical specification establishes the structural rules governing state tracking across service boundaries, data consistency constraints for asynchronous background workers, and crash-recovery protocols for distributed nodes.

---

## 1. State Tracking Patterns Across Service Boundaries

Inter-service communication must balance loose coupling with strict state encapsulation. Services must expose clear boundary contracts while hiding internal persistence mechanisms to avoid structural and semantic breakages.

### 1.1 Bounded Contexts and Aggregate Encapsulation

Microservice boundaries must be drawn around domain-driven bounded contexts and entities modeled as aggregates. An aggregate represents a self-contained state machine that owns its data, lifecycle, and business invariants.

1. **State Ownership Rule**: A microservice must exclusively own the storage and lifecycle of its aggregates. Direct database sharing across microservice boundaries (content coupling) is strictly prohibited. External services must request state changes or query data via explicit service interfaces or published events.
2. **Finite State Machine Invariant**: Aggregates must be implemented as explicit state machines that validate incoming requests against allowable state transitions. Services must treat incoming execution directives as requests—not mandatory commands—and must reject invalid transitions.
3. **Database Wrappers Prohibition**: Service interfaces must not expose raw CRUD updates that map directly to database tables. Leaking state transition logic to upstream consumers reduces cohesion and reintroduces distributed state management bugs.

| Coupling Type | Architectural Impact | Boundary Invariant |
| :--- | :--- | :--- |
| **Content Coupling** | Services share raw database tables or files. | **Prohibited.** Eliminates information hiding and prevents independent deployment. |
| **Common Coupling** | Multiple services read/write to shared global data structures. | **Prohibited.** Causes race conditions and shared state transition collisions. |
| **Domain Coupling** | Service calls another service API or consumes its domain events. | **Allowed.** Requires explicit contract versioning and tolerant readers. |
| **Pass-Through Coupling** | Service forwards unneeded data to downstream services. | **Avoided.** Reduces payload encapsulation and leaks structural dependencies. |

### 1.2 Request-Response State Tracking

Request-response communication models synchronous or asynchronous operations where an upstream service requests a downstream service to perform work and yield a deterministic result.

```
Synchronous Blocking:
[Client] --- (HTTP POST / API Call) ---> [Downstream Service] (Blocks TCP Connection)

Asynchronous Non-Blocking:
[Client] --- (Request Message + Correlation ID) ---> [Request Queue] ---> [Worker]
[Client] <--- (Response Message + Correlation ID) <-- [Response Queue] <--- [Worker]
```

1. **Synchronous Blocking Boundary Rules**:
   - Synchronous HTTP/gRPC calls introduce temporal coupling: the calling service depends on the downstream service being reachable and responsive in real time.
   - Failures must handle cascading blockages using timeouts, circuit breakers, and explicit fallback logic.
2. **Asynchronous Non-Blocking Request-Response Rules**:
   - Requests are published as messages to a dedicated broker queue; downstream consumers process requests asynchronously and publish responses to a return queue.
   - **Correlation ID Tracking**: The initiating service must generate a globally unique `Correlation ID` and store the pending request state in a local database before emitting the request. Upon receiving the asynchronous response, the service uses the `Correlation ID` to reload the local state and execute the state transition.

### 1.3 Event-Driven State Tracking

Event-driven architectures decouple producers from consumers through asynchronous event streams. An event is an immutable historical statement describing a state change that occurred within the emitting service.

1. **Event Sourcing and CQRS**:
   - **Event Sourcing**: System state is stored as an append-only log of immutable past-tense events (`OrderPlaced`, `PaymentReceived`). Current state is a derived projection computed by sequentially replaying the log.
   - **CQRS (Command Query Responsibility Segregation)**: Commands validate business rules and append events to the write log. Materialized read models (projections) consume the event log asynchronously to build denormalized, query-optimized views.
2. **Payload Design Strategies**:
   - **ID-Only Events**: The event contains only an aggregate identifier (e.g., `CustomerId`). Downstream consumers must make synchronous back-calls to the source service to fetch detailed payload data. This minimizes payload footprint but creates domain coupling and call-storm vulnerabilities.
   - **Event-Carried State Transfer (Fully Detailed Events)**: The event includes all state fields required for downstream processing (e.g., `Name`, `Email`). Consumers maintain local autonomous replicas without calling the source service. Events must not violate data privacy boundaries (e.g., sensitive PII must be filtered or encrypted).

### 1.4 Saga Coordination Patterns

Long-Lived Transactions (LLTs) spanning multiple microservice boundaries cannot use two-phase locking without causing severe performance degradation and lock contention. Instead, multi-service workflows must be modeled as Sagas—sequences of local transactions linked by messages or events.

```
Orchestrated Saga:
[Orchestrator DB] <--- State Log
[Orchestrator] --- (Execute Step 1) ---> [Service A]
[Orchestrator] --- (Execute Step 2) ---> [Service B]
[Orchestrator] --- (Compensate Step 1) -> [Service A] (On Step 2 Failure)

Choreographed Saga:
[Service A] --- (Event: Step 1 Done) ---> [Topic] ---> [Service B]
[Service B] --- (Event: Step 2 Failed) -> [Topic] ---> [Service A] (Executes Compensation)
```

1. **Orchestrated Sagas**:
   - A central orchestrator service explicitly directs workflow steps using request-response commands and tracks saga state in a local persistent database.
   - **Failure Handling**: If a step fails, the orchestrator issues compensating commands to previously executed steps in reverse order (fail-backward) or retries the failed step until it succeeds (fail-forward).
2. **Choreographed Sagas**:
   - Participating services listen to domain event streams and autonomously execute local transactions in response to incoming events, emitting downstream events upon completion.
   - **State Observability Invariant**: Every event in a choreographed saga must carry a `Saga/Correlation ID`. Observability and compensating execution require a dedicated analytics service to consume all event streams and project an aggregate status view for each active saga.

---

## 2. Consistency Constraints for Asynchronous Background Execution

Maintaining data consistency across asynchronous background workers requires eliminating blocking distributed protocols in favor of idempotent processing and event-driven state propagation.

### 2.1 Elimination of Two-Phase Commit (2PC) and Dual Writes

Traditional two-phase commit (2PC / XA) protocols across heterogeneous storage systems fail in cloud environments due to network delays, unbounded process pauses, and blocking coordinator failures.

1. **The Distributed Transaction Failure Mode**:
   - In 2PC, if a participant votes `YES` during Phase 1 (Prepare) and the coordinator crashes before issuing Phase 2 (Commit/Abort), the participant is stuck in an in-doubt state, holding database locks indefinitely.
2. **The Dual Write Race Condition**:
   - Updating a local database and publishing a message to a broker in application code creates dual write hazards. If the database commit succeeds but the message broker publish fails, the systems become permanently out of sync.
   - Even if both writes succeed, concurrent workers updating the database and broker in different orders will produce corrupted state in derived systems.

```
Dual Write Anti-Pattern (Unsafe):
App -> DB: UPDATE accounts SET balance = ...
App -> Broker: Publish(AccountUpdated) -- [NETWORK FAIL / CRASH RISKS INCONSISTENCY]

Transactional Outbox Pattern (Safe):
[ACID Transaction Start]
App -> DB: UPDATE accounts SET balance = ...
App -> DB: INSERT INTO outbox_table (id, payload, status)
[ACID Transaction Commit]
[Outbox Processor / CDC Engine] -> Broker: Publish(outbox_table)
```

3. **Transactional Outbox and Change Data Capture (CDC)**:
   - **Transactional Outbox**: Application state changes and outgoing message payloads are written to an `outbox` table within the *same local database ACID transaction*. An independent background worker reads the `outbox` table and publishes messages to the broker.
   - **CDC (Change Data Capture)**: A log tailer parses the database write-ahead log (WAL / binlog) directly, streaming committed transactions into the message broker in total commit order. This guarantees at-least-once message delivery without double-writing at the application layer.

### 2.2 End-to-End Idempotency and Deduplication Protocols

Because network delivery is inherently at-least-once, background workers must process messages idempotently to guarantee that duplicate deliveries do not cause state corruption.

1. **Unique Request / Message Identifier Invariant**: Every incoming payload or RPC must carry a globally unique `Request ID` generated by the initiating client.
2. **Deduplication Table Protocol**:
   - Before executing logic, the worker opens a local transaction and inserts the `Request ID` into a dedicated `processed_requests` table with a unique key constraint.
   - If the key exists, the transaction aborts and the duplicate message is acknowledged and discarded.
   - If the key is new, the worker executes business logic, records the `Request ID`, and commits the transaction atomically.
3. **Fencing Tokens for Leaseholders**:
   - When using background workers with distributed locks/leases (e.g., ZooKeeper / etcd), a paused worker (zombie node) may resume execution after its lease expires.
   - **Fencing Token Invariant**: The lock service must assign a monotonically increasing integer (`fencing_token`) on every lease grant. Storage engines must reject any write request whose `fencing_token` is strictly lower than the highest token previously processed.

| Idempotency Mechanism | Operating Principle | Appropriate Use Case |
| :--- | :--- | :--- |
| **Deduplication Table** | Atomic check-and-insert of `Request ID` in a local database transaction. | Non-idempotent state mutations (e.g., financial balance transfers, inventory decrements). |
| **Natural Idempotency** | State updates that produce identical results regardless of invocation count. | Absolute value overwrites (`SET status = 'PAID'`), tombstone deletions, set additions. |
| **Conditional Writes (CAS)** | Atomic Compare-And-Swap execution (`UPDATE ... WHERE version = expected_version`). | Optimistic concurrency control across concurrent workers. |
| **Fencing Tokens** | Monotonically increasing epoch sequence attached to distributed leases. | Guarding storage writes against zombie workers and process pauses. |

### 2.3 Concurrent Write Resolution and Convergence

Asynchronous background workers processing shared resources in parallel will encounter concurrent, uncoordinated writes. Replicas and materialized views must execute deterministic convergence algorithms.

1. **Hazards of Last-Write-Wins (LWW)**:
   - LWW uses time-of-day clock timestamps (e.g., wall-clock Unix time) to select the "winning" write. Because physical clocks across distributed nodes suffer from unsynchronized clock skew, LWW silently drops valid concurrent writes and violates causal ordering. LWW should only be used if data loss is acceptable or updates are purely additive with unique keys.
2. **Version Vectors and Causal Dependency Tracking**:
   - Systems must track causal history using Version Vectors or Lamport Timestamps. When concurrent writes (siblings) are detected (neither version vector dominates the other), the system retains all sibling versions.
   - Merging must be performed explicitly by application code or by utilizing Conflict-Free Replicated Data Types (CRDTs) where operations are commutative, associative, and idempotent (e.g., PN-Counters, OR-Sets).
3. **Total Order Broadcast via Shared Logs**:
   - To avoid concurrent conflict resolution entirely, all write operations must pass through a partitioned, append-only log broker (e.g., Apache Kafka). The single-threaded offset sequence within each log partition defines a total ordering of events, enforcing deterministic state execution across all worker replicas.

---

## 3. Crash Resiliency, Logging, and Recovery Mechanics

Crash resiliency requires that distributed nodes and background scripts can restart at any point mid-run, detect uncommitted or corrupted state, and resume execution cleanly without human intervention.

### 3.1 Storage Engine Crash Recovery

State persistence engines preserve durability and atomicity during unexpected crashes or power failures through write-ahead logs and append-only disk structures.

```
B-Tree Write-Ahead Logging:
[Modify Request] ---> (Append Log + fsync) ---> [Write-Ahead Log (Disk)]
                            |
                   (Page Buffer in Memory)
                            |
                   (Async Flush to Disk Pages)

LSM-Tree Crash-Recovery Path:
[Write Request] ---> (Append WAL) + (Insert into Memtable in Memory)
                                             | (Threshold Reached)
                                             v
                             (Flush to SSTable Segment File on Disk)
                             (Discard Corresponding WAL Segment)
```

1. **Write-Ahead Logging (WAL) Protocol**:
   - Before modifying any in-memory page or state structure, the change must be appended to an on-disk append-only log and flushed using the `fsync()` system call.
   - On node startup following a crash, the storage engine reads the WAL from the last checkpoint, checking log record checksums. Incomplete or corrupted log records resulting from torn page writes during power loss are truncated, and committed transactions are replayed to restore memory and disk structures to a consistent snapshot.
2. **Log-Structured Merge (LSM) Engine Recovery**:
   - Writes are appended to an active WAL and inserted into an in-memory sorted structure (`memtable`). When the `memtable` exceeds a size threshold, it is flushed to disk as an immutable Sorted String Table (`SSTable`) segment file, and the corresponding WAL segment is freed.
   - **Crash Invariant**: If a node crashes while flushing an `SSTable`, the partially written segment file is deleted on restart. The engine rebuilds the `memtable` state entirely by replaying the active WAL file.

### 3.2 Durable Execution and Workflow Replay

Durable execution frameworks (e.g., Temporal, Restate) provide fault-tolerant, effectively-once state execution for long-running workflows across crashing worker nodes.

1. **Event Replay Architecture**:
   - The framework logs every external interaction (RPC calls, timer firings, task completions) as an append-only event history stored in a fault-tolerant database.
   - When a worker executing a workflow crashes mid-run, the framework re-assigns the workflow to a new worker. The new worker executes the workflow code from line 1, replaying the event log. During replay, any RPC call recorded in the log is skipped, and its historical return value is injected directly from the event log.
2. **Hard Rules for Deterministic Workflow Code**:
   - Workflow code must be 100% deterministic. Replaying the code against the same event log must issue identical RPC calls in identical sequence.
   - **Prohibited Nondeterministic Operations**:
     - Direct calls to system clocks (e.g., `DateTime.Now()`) or random number generators.
     - Non-deterministic multithreaded scheduling or race-dependent async execution.
     - External network calls performed outside the framework's tracked activity primitives.
3. **Workflow Code Versioning Invariant**:
   - Modifications to live workflow code must be deployed with explicit version flags. Re-ordering function calls or adding new RPC primitives to unversioned active code will cause log replay failures during recovery.

### 3.3 Stream Worker Checkpointing and State Rebuilding

Asynchronous stream processing engines (e.g., Apache Flink, Kafka Streams) maintain local stateful aggregations across continuous, unbounded event streams while surviving worker node crashes.

1. **Barrier Checkpointing Protocol**:
   - Checkpoint barriers are injected into the input message stream alongside regular events. Stream processing operators process stream events continuously in memory.
   - Upon encountering a checkpoint barrier, the worker snapshots its current local operator state to persistent object storage (e.g., S3/HDFS).
   - **Failure Recovery Path**: When a worker node crashes, the stream processing coordinator resets all pipeline workers back to the offset of the last acknowledged checkpoint barrier. Operators reload their local state from the persistent snapshot and resume stream consumption from the checkpointed offset.
2. **Log Offset Management and Re-processability**:
   - Workers consuming from log-based brokers must commit consumer offsets *only after* local state updates or downstream outputs have been durably persisted or committed within a microbatch transaction.
   - **State Rebuilding via Event Replay**: Because log-based brokers retain immutable event streams, corrupted derived views or lost local state caches can be completely rebuilt. Developers can clear the derived state, update the execution logic, and reset the consumer offset to offset 0, replaying the entire stream history to compute a clean, correct state model.
