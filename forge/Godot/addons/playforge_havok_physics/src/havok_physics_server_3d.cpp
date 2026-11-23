// PlayForge Havok Physics 2025.1.1 GDExtension (PhysicsServer3DExtension)
// Experimental branch: Forge-HavokPhysics

#include "gdextension_interface.h"

#include <Common/Base/hkBase.h>
#include <Common/Base/System/hkBaseSystem.h>
#include <Common/Base/System/Hardware/hkHardwareInfo.h>
#include <Common/Base/Container/BlockStream/Allocator/Dynamic/hkDynamicBlockStreamAllocator.h>
#include <Common/Base/Thread/Thread/hkThread.h>
#include <Common/Base/Thread/Semaphore/hkSemaphore.h>
#include <Common/Base/Thread/TaskQueue/Default/hkDefaultTaskQueue.h>

#include <Physics/Physics/hknpProductFeatures.h>
#include <Physics/Physics/Collide/Shape/hknpShape.h>
#include <Physics/Physics/Dynamics/Material/hknpMaterial.h>
#include <Physics/Physics/Dynamics/Material/hknpMaterialLibrary.h>
#include <Physics/Physics/Dynamics/World/hknpWorld.h>
#include <Physics/Physics/Dynamics/World/hknpWorldCinfo.h>
#include <Physics/Physics/Dynamics/Simulation/Multithreaded/hknpTaskGraph.h>

#include <atomic>
#include <chrono>
#include <cmath>
#include <cstdint>
#include <cstdio>
#include <cstring>
#include <memory>
#include <string>
#include <unordered_map>
#include <vector>

#ifndef WIN32_LEAN_AND_MEAN
#define WIN32_LEAN_AND_MEAN
#endif
#include <windows.h>
#include <psapi.h>

namespace {

// ---------------------------------------------------------------------------
// Godot 4.7.2 ABI structs (single precision, 64-bit)
// ---------------------------------------------------------------------------
struct GdVector3 {
    float x, y, z;
};

struct GdBasis {
    GdVector3 rows[3];
};

struct GdTransform3D {
    GdBasis basis;
    GdVector3 origin;
};

struct GdPlane {
    GdVector3 normal;
    float d;
};

struct GdStringName {
    uint64_t opaque = 0;
};

struct GdString {
    uint64_t opaque = 0;
};

struct GdCallable {
    uint64_t opaque[2] = {0, 0};
};

struct GdVariant {
    uint8_t opaque[24] = {};
};

struct GdPackedArray {
    uint64_t opaque[2] = {0, 0};
};

static_assert(sizeof(GdVector3) == 12, "Vector3 size mismatch");
static_assert(sizeof(GdBasis) == 36, "Basis size mismatch");
static_assert(sizeof(GdTransform3D) == 48, "Transform3D size mismatch");
static_assert(sizeof(GdPlane) == 16, "Plane size mismatch");
static_assert(sizeof(GdStringName) == 8, "StringName size mismatch");
static_assert(sizeof(GdString) == 8, "String size mismatch");
static_assert(sizeof(GdCallable) == 16, "Callable size mismatch");
static_assert(sizeof(GdVariant) == 24, "Variant size mismatch");
static_assert(sizeof(GdPackedArray) == 16, "PackedArray size mismatch");

// PhysicsServer3D enums (from Godot 4.7.2 extension_api.json)
enum GdShapeType : int64_t {
    SHAPE_WORLD_BOUNDARY = 0,
    SHAPE_SEPARATION_RAY = 1,
    SHAPE_SPHERE = 2,
    SHAPE_BOX = 3,
    SHAPE_CAPSULE = 4,
    SHAPE_CYLINDER = 5,
    SHAPE_CONVEX_POLYGON = 6,
    SHAPE_CONCAVE_POLYGON = 7,
    SHAPE_HEIGHTMAP = 8,
    SHAPE_SOFT_BODY = 9,
    SHAPE_CUSTOM = 10,
};

enum GdBodyMode : int64_t {
    BODY_MODE_STATIC = 0,
    BODY_MODE_KINEMATIC = 1,
    BODY_MODE_RIGID = 2,
    BODY_MODE_RIGID_LINEAR = 3,
};

enum GdBodyParam : int64_t {
    BODY_PARAM_BOUNCE = 0,
    BODY_PARAM_FRICTION = 1,
    BODY_PARAM_MASS = 2,
    BODY_PARAM_INERTIA = 3,
    BODY_PARAM_CENTER_OF_MASS = 4,
    BODY_PARAM_GRAVITY_SCALE = 5,
    BODY_PARAM_LINEAR_DAMP_MODE = 6,
    BODY_PARAM_ANGULAR_DAMP_MODE = 7,
    BODY_PARAM_LINEAR_DAMP = 8,
    BODY_PARAM_ANGULAR_DAMP = 9,
};

enum GdBodyState : int64_t {
    BODY_STATE_TRANSFORM = 0,
    BODY_STATE_LINEAR_VELOCITY = 1,
    BODY_STATE_ANGULAR_VELOCITY = 2,
    BODY_STATE_SLEEPING = 3,
    BODY_STATE_CAN_SLEEP = 4,
};

enum GdProcessInfo : int64_t {
    INFO_ACTIVE_OBJECTS = 0,
    INFO_COLLISION_PAIRS = 1,
    INFO_ISLAND_COUNT = 2,
};

enum GdAreaParam : int64_t {
    AREA_PARAM_GRAVITY_OVERRIDE_MODE = 0,
    AREA_PARAM_GRAVITY = 1,
    AREA_PARAM_GRAVITY_VECTOR = 2,
};

// ---------------------------------------------------------------------------
// Cached GDExtension interface function pointers
// ---------------------------------------------------------------------------
struct GdApi {
    GDExtensionClassLibraryPtr library = nullptr;
    GDExtensionInterfaceGetProcAddress get_proc = nullptr;

    GDExtensionInterfaceStringNewWithUtf8Chars string_new = nullptr;
    GDExtensionInterfaceStringNameNewWithUtf8Chars string_name_new = nullptr;
    GDExtensionInterfaceVariantGetPtrConstructor variant_get_ptr_constructor = nullptr;
    GDExtensionInterfaceVariantGetPtrDestructor variant_get_ptr_destructor = nullptr;
    GDExtensionInterfaceVariantGetPtrBuiltinMethod variant_get_ptr_builtin_method = nullptr;
    GDExtensionPtrDestructor string_destroy = nullptr;
    GDExtensionPtrDestructor string_name_destroy = nullptr;
    GDExtensionPtrDestructor callable_destroy = nullptr;
    GDExtensionPtrConstructor packed_float32_ctor = nullptr;
    GDExtensionPtrDestructor packed_float32_destroy = nullptr;
    GDExtensionPtrDestructor packed_int64_destroy = nullptr;
    GDExtensionPtrBuiltInMethod packed_float32_size = nullptr;
    GDExtensionPtrBuiltInMethod packed_float32_resize = nullptr;
    GDExtensionPtrBuiltInMethod packed_int64_size = nullptr;
    GDExtensionInterfacePackedFloat32ArrayOperatorIndex packed_float32_index = nullptr;
    GDExtensionInterfacePackedFloat32ArrayOperatorIndexConst packed_float32_index_const = nullptr;
    GDExtensionInterfacePackedInt64ArrayOperatorIndexConst packed_int64_index_const = nullptr;

    GDExtensionInterfaceVariantNewNil variant_new_nil = nullptr;
    GDExtensionInterfaceVariantNewCopy variant_new_copy = nullptr;
    GDExtensionInterfaceVariantDestroy variant_destroy = nullptr;
    GDExtensionInterfaceVariantGetType variant_get_type = nullptr;
    GDExtensionInterfaceGetVariantFromTypeConstructor get_var_from_type = nullptr;
    GDExtensionInterfaceGetVariantToTypeConstructor get_var_to_type = nullptr;

    GDExtensionVariantFromTypeConstructorFunc var_from_bool = nullptr;
    GDExtensionVariantFromTypeConstructorFunc var_from_int = nullptr;
    GDExtensionVariantFromTypeConstructorFunc var_from_float = nullptr;
    GDExtensionVariantFromTypeConstructorFunc var_from_vec3 = nullptr;
    GDExtensionVariantFromTypeConstructorFunc var_from_xform3d = nullptr;
    GDExtensionVariantFromTypeConstructorFunc var_from_object = nullptr;
    GDExtensionVariantFromTypeConstructorFunc var_from_plane = nullptr;

    GDExtensionTypeFromVariantConstructorFunc bool_from_var = nullptr;
    GDExtensionTypeFromVariantConstructorFunc int_from_var = nullptr;
    GDExtensionTypeFromVariantConstructorFunc float_from_var = nullptr;
    GDExtensionTypeFromVariantConstructorFunc vec3_from_var = nullptr;
    GDExtensionTypeFromVariantConstructorFunc xform3d_from_var = nullptr;
    GDExtensionTypeFromVariantConstructorFunc plane_from_var = nullptr;
    GDExtensionTypeFromVariantConstructorFunc rid_from_var = nullptr;
    GDExtensionTypeFromVariantConstructorFunc packed_int64_from_var = nullptr;
    GDExtensionTypeFromVariantConstructorFunc packed_float32_from_var = nullptr;

    GDExtensionInterfaceGlobalGetSingleton global_get_singleton = nullptr;
    GDExtensionInterfaceClassdbConstructObject2 classdb_construct_object2 = nullptr;
    GDExtensionInterfaceClassdbGetMethodBind classdb_get_method_bind = nullptr;
    GDExtensionInterfaceClassdbRegisterExtensionClass4 classdb_register_class4 = nullptr;
    GDExtensionInterfaceClassdbRegisterExtensionClassMethod classdb_register_method = nullptr;
    GDExtensionInterfaceClassdbUnregisterExtensionClass classdb_unregister_class = nullptr;
    GDExtensionInterfaceObjectMethodBindPtrcall object_method_bind_ptrcall = nullptr;
    GDExtensionInterfaceObjectSetInstance object_set_instance = nullptr;
    GDExtensionInterfaceObjectSetInstanceBinding object_set_instance_binding = nullptr;
    GDExtensionInterfaceCallableCustomCreate2 callable_custom_create2 = nullptr;
    GDExtensionInterfacePrintWarning print_warning = nullptr;
};

static GdApi g_api;

static GdStringName make_sn(const char* s) {
    GdStringName sn{};
    g_api.string_name_new(&sn, s);
    return sn;
}

static void free_sn(GdStringName& sn) {
    if (sn.opaque && g_api.string_name_destroy) {
        g_api.string_name_destroy(&sn);
        sn.opaque = 0;
    }
}

static GdString make_str(const char* s) {
    GdString str{};
    g_api.string_new(&str, s);
    return str;
}

static void free_str(GdString& str) {
    if (str.opaque && g_api.string_destroy) {
        g_api.string_destroy(&str);
        str.opaque = 0;
    }
}

static double variant_to_double(const GdVariant* v) {
    GDExtensionVariantType t = g_api.variant_get_type(v);
    if (t == GDEXTENSION_VARIANT_TYPE_FLOAT) {
        double out = 0.0;
        g_api.float_from_var(&out, const_cast<GdVariant*>(v));
        return out;
    }
    if (t == GDEXTENSION_VARIANT_TYPE_INT) {
        int64_t out = 0;
        g_api.int_from_var(&out, const_cast<GdVariant*>(v));
        return static_cast<double>(out);
    }
    return 0.0;
}

static bool variant_to_bool(const GdVariant* v) {
    GDExtensionVariantType t = g_api.variant_get_type(v);
    if (t == GDEXTENSION_VARIANT_TYPE_BOOL) {
        GDExtensionBool out = 0;
        g_api.bool_from_var(&out, const_cast<GdVariant*>(v));
        return out != 0;
    }
    return false;
}

static GdVector3 variant_to_vec3(const GdVariant* v) {
    GdVector3 out{0.0f, 0.0f, 0.0f};
    if (g_api.variant_get_type(v) == GDEXTENSION_VARIANT_TYPE_VECTOR3) {
        g_api.vec3_from_var(&out, const_cast<GdVariant*>(v));
    }
    return out;
}

static GdTransform3D variant_to_xform3d(const GdVariant* v) {
    GdTransform3D out{};
    out.basis.rows[0] = {1.0f, 0.0f, 0.0f};
    out.basis.rows[1] = {0.0f, 1.0f, 0.0f};
    out.basis.rows[2] = {0.0f, 0.0f, 1.0f};
    out.origin = {0.0f, 0.0f, 0.0f};
    if (g_api.variant_get_type(v) == GDEXTENSION_VARIANT_TYPE_TRANSFORM3D) {
        g_api.xform3d_from_var(&out, const_cast<GdVariant*>(v));
    }
    return out;
}

static GdPlane variant_to_plane(const GdVariant* v) {
    GdPlane out{{0.0f, 1.0f, 0.0f}, 0.0f};
    if (g_api.variant_get_type(v) == GDEXTENSION_VARIANT_TYPE_PLANE) {
        g_api.plane_from_var(&out, const_cast<GdVariant*>(v));
    }
    return out;
}

static GdTransform3D identity_xform() {
    GdTransform3D x{};
    x.basis.rows[0] = {1.0f, 0.0f, 0.0f};
    x.basis.rows[1] = {0.0f, 1.0f, 0.0f};
    x.basis.rows[2] = {0.0f, 0.0f, 1.0f};
    x.origin = {0.0f, 0.0f, 0.0f};
    return x;
}

// Convert Godot row-major Basis + origin <-> Havok column-major hkRotation + hkVector4d
static void godot_to_havok_xform(const GdTransform3D& gd, hkRotation& rotOut, hkVector4d& posOut) {
    hkVector4 col0(gd.basis.rows[0].x, gd.basis.rows[1].x, gd.basis.rows[2].x);
    hkVector4 col1(gd.basis.rows[0].y, gd.basis.rows[1].y, gd.basis.rows[2].y);
    hkVector4 col2(gd.basis.rows[0].z, gd.basis.rows[1].z, gd.basis.rows[2].z);
    // Normalize columns in case of slight numerical drift or uniform scale
    if (col0.lengthSquared<3>().getReal() > 1e-12f) col0.normalize<3>();
    else col0.set(1.0f, 0.0f, 0.0f);
    if (col1.lengthSquared<3>().getReal() > 1e-12f) col1.normalize<3>();
    else col1.set(0.0f, 1.0f, 0.0f);
    if (col2.lengthSquared<3>().getReal() > 1e-12f) col2.normalize<3>();
    else col2.set(0.0f, 0.0f, 1.0f);
    rotOut.setCols(col0, col1, col2);
    posOut.set(gd.origin.x, gd.origin.y, gd.origin.z);
}

static GdTransform3D havok_to_godot_xform(const hkPreciseTransform& hk) {
    GdTransform3D gd{};
    const hkRotation& r = hk.getRotation();
    const hkVector4& c0 = r.getColumn<0>();
    const hkVector4& c1 = r.getColumn<1>();
    const hkVector4& c2 = r.getColumn<2>();
    gd.basis.rows[0] = {c0(0), c1(0), c2(0)};
    gd.basis.rows[1] = {c0(1), c1(1), c2(1)};
    gd.basis.rows[2] = {c0(2), c1(2), c2(2)};
    const hkVector4d& p = hk.getTranslation();
    gd.origin = {static_cast<float>(p(0)), static_cast<float>(p(1)), static_cast<float>(p(2))};
    return gd;
}

// ---------------------------------------------------------------------------
// Havok Runtime Global State + Worker Pool + Telemetry
// ---------------------------------------------------------------------------
static void HK_CALL havok_error_report(const char* msg, void*) {
    if (msg && msg[0] != '\0') {
        std::fprintf(stderr, "[Havok] %s\n", msg);
    }
}

struct HavokWorkerThread {
    HK_DECLARE_CLASS(HavokWorkerThread, New);

    explicit HavokWorkerThread(hkTaskQueue* taskQueue) : m_taskQueue(taskQueue) {
        m_thread = hkThread::make([this] {
            while (true) {
                m_workAvailable.acquire();
                if (m_taskQueue) {
                    m_taskQueue->processUntilFinished(m_handleToWaitFor);
                } else {
                    break;
                }
                m_workFinished.release();
            }
        });
    }

    ~HavokWorkerThread() {
        m_taskQueue = nullptr;
        m_workAvailable.release();
        m_thread->join();
    }

    void processTasks(const hkTaskQueue::Handle& finalHandle) {
        m_handleToWaitFor = finalHandle;
        m_workAvailable.release();
    }

    void waitUntilFinished() {
        m_workFinished.acquire();
    }

    hkScopedPtr<hkThread> m_thread;
    hkTaskQueue* m_taskQueue = nullptr;
    hkTaskQueue::Handle m_handleToWaitFor;
    hkSemaphore m_workAvailable;
    hkSemaphore m_workFinished;
};

struct HavokTelemetry {
    std::atomic<int64_t> last_step_us{0};
    std::atomic<int64_t> last_collide_us{0};
    std::atomic<int64_t> last_solve_us{0};
    std::atomic<int64_t> worker_threads{1};
    std::atomic<int64_t> active_bodies{0};
    std::atomic<int64_t> total_bodies{0};
    std::atomic<int64_t> step_count{0};
};

static HavokTelemetry g_telemetry;
static bool g_havok_initialized = false;

static void ensure_havok_init() {
    if (g_havok_initialized) return;
    hkBaseSystem::Cinfo baseCinfo = hkBaseSystem::Cinfo::getDefault(havok_error_report);
    hkBaseSystem::init(baseCinfo);
    hkProductFeatures::Physics::All::request();
    g_havok_initialized = true;
}

static void shutdown_havok() {
    if (!g_havok_initialized) return;
    hkBaseSystem::quit();
    g_havok_initialized = false;
}

// ---------------------------------------------------------------------------
// HavokPhysicsServer3D implementation
// ---------------------------------------------------------------------------
class HavokPhysicsServer3D;
static HavokPhysicsServer3D* g_active_havok_server = nullptr;

class HavokPhysicsServer3D {
public:
    struct ShapeEntry {
        GdShapeType type = SHAPE_BOX;
        GdVector3 box_half_extents{0.5f, 0.5f, 0.5f};
        float sphere_radius = 0.5f;
        float capsule_radius = 0.5f;
        float capsule_height = 1.0f;
        GdPlane plane{{0.0f, 1.0f, 0.0f}, 0.0f};
        hkRefPtr<hknpShape> hk_shape;
    };

    struct SpaceEntry {
        bool active = true;
        hkVector4 gravity{0.0f, -9.8f, 0.0f};
        std::unique_ptr<hkDynamicBlockStreamAllocator> block_allocator;
        hkRefPtr<hknpWorld> world;
        std::unordered_map<uint32_t, hknpMaterialId> material_cache;
        hknpMaterialId default_material_id;
        std::vector<uint64_t> body_rids;

        void ensure_world() {
            if (world) return;
            block_allocator = std::make_unique<hkDynamicBlockStreamAllocator>(
                16 * 1024 * 1024, hkDynamicBlockStreamAllocator::KEEP_BLOCKS);
            hknpWorldCinfo info;
            info.m_gravity = gravity;
            info.m_blockStreamAllocator = block_allocator.get();
            info.m_bodyBufferCapacity = 65536;
            info.m_motionBufferCapacity = 65536;
            info.m_constraintBufferCapacity = 16384;
            info.m_simulationType = hknpSimulationType::MULTI_THREADED;
            info.m_enableDefaultModificationTracker = false;
            world = hk::makeRef<hknpWorld>(info);

            hknpMaterial mat;
            mat.m_staticFriction = 0.6f;
            mat.m_dynamicFriction = 0.6f;
            mat.m_restitution = 0.0f;
            default_material_id = world->accessMaterialLibrary()->addEntry(mat);
            material_cache[pack_mat_key(0.6f, 0.0f)] = default_material_id;
        }

        static uint32_t pack_mat_key(float friction, float bounce) {
            uint32_t f = static_cast<uint32_t>(std::lround(friction * 100.0f)) & 0xFFFFu;
            uint32_t b = static_cast<uint32_t>(std::lround(bounce * 100.0f)) & 0xFFFFu;
            return (f << 16) | b;
        }

        hknpMaterialId get_or_create_material(float friction, float bounce) {
            ensure_world();
            uint32_t key = pack_mat_key(friction, bounce);
            auto it = material_cache.find(key);
            if (it != material_cache.end()) return it->second;
            hknpMaterial mat;
            mat.m_staticFriction = friction;
            mat.m_dynamicFriction = friction;
            mat.m_restitution = bounce;
            hknpMaterialId id = world->accessMaterialLibrary()->addEntry(mat);
            material_cache[key] = id;
            return id;
        }
    };

    struct AreaEntry {
        uint64_t space_rid = 0;
        float gravity = 9.8f;
        GdVector3 gravity_vec{0.0f, -1.0f, 0.0f};
    };

    struct FastBodySlot {
        hknpWorld* world = nullptr;
        hknpBodyId id = hknpBodyId::invalid();
    };

    struct BodyEntry {
        uint64_t self_rid = 0;
        uint64_t space_rid = 0;
        uint64_t shape_rid = 0;
        GdTransform3D shape_local_xform = identity_xform();
        bool shape_disabled = false;
        GdBodyMode mode = BODY_MODE_RIGID;
        GdTransform3D transform = identity_xform();
        GdVector3 linear_velocity{0.0f, 0.0f, 0.0f};
        GdVector3 angular_velocity{0.0f, 0.0f, 0.0f};
        float mass = 1.0f;
        float friction = 0.6f;
        float bounce = 0.0f;
        float gravity_scale = 1.0f;
        float linear_damp = 0.0f;
        float angular_damp = 0.0f;
        uint32_t collision_layer = 1;
        uint32_t collision_mask = 1;
        bool can_sleep = true;
        bool sleeping = false;
        bool in_world = false;
        hknpBodyId hk_body_id = hknpBodyId::invalid();
    };

    explicit HavokPhysicsServer3D(GDExtensionObjectPtr owner) : m_owner(owner) {}

    ~HavokPhysicsServer3D() {
        finish();
    }

    void init() {
        ensure_havok_init();
        if (!m_task_queue) {
            m_task_queue = std::make_unique<hkDefaultTaskQueue>();
            const int hw = hkHardwareInfo::getNumHardwareThreads();
            const int maxT = m_task_queue->getMaxNumSupportedThreads();
            m_num_threads = hkMath::min2(hw, maxT);
            if (m_num_threads < 1) m_num_threads = 1;
            for (int i = 0; i < m_num_threads - 1; ++i) {
                m_workers.push_back(std::make_unique<HavokWorkerThread>(m_task_queue.get()));
            }
            g_telemetry.worker_threads.store(m_num_threads, std::memory_order_relaxed);
        }
        g_active_havok_server = this;
        m_active = true;
    }

    void finish() {
        if (g_active_havok_server == this) {
            g_active_havok_server = nullptr;
        }
        m_fast_bodies.clear();
        // Destroy all spaces/worlds and shapes BEFORE quitting Havok
        for (auto& kv : m_bodies) {
            kv.second.in_world = false;
            kv.second.hk_body_id = hknpBodyId::invalid();
        }
        m_bodies.clear();
        m_areas.clear();
        for (auto& kv : m_spaces) {
            kv.second->world = nullptr;
            kv.second->block_allocator.reset();
        }
        m_spaces.clear();
        m_shapes.clear();
        m_workers.clear();
        m_task_queue.reset();
    }

    void set_active(bool active) { m_active = active; }

    // --- Shapes ---
    uint64_t create_shape(GdShapeType type) {
        uint64_t rid = alloc_rid();
        ShapeEntry entry;
        entry.type = type;
        if (type == SHAPE_BOX) {
            entry.hk_shape = hknpShape::makeBoxFromHalfExtents(hkVector4(0.5f, 0.5f, 0.5f));
        } else if (type == SHAPE_SPHERE) {
            entry.hk_shape = hknpShape::makeSphere(0.5f);
        } else if (type == SHAPE_CAPSULE) {
            entry.hk_shape = hknpShape::makeCapsule(hkVector4(0.0f, -0.5f, 0.0f), hkVector4(0.0f, 0.5f, 0.0f), 0.5f);
        } else if (type == SHAPE_WORLD_BOUNDARY) {
            entry.hk_shape = hknpShape::makeBoxFromHalfExtents(hkVector4(2000.0f, 1.0f, 2000.0f));
        }
        m_shapes[rid] = std::move(entry);
        return rid;
    }

    void shape_set_data(uint64_t rid, const GdVariant* data) {
        auto it = m_shapes.find(rid);
        if (it == m_shapes.end()) return;
        ShapeEntry& s = it->second;
        if (s.type == SHAPE_BOX) {
            GdVector3 he = variant_to_vec3(data);
            if (he.x < 1e-4f) he.x = 0.5f;
            if (he.y < 1e-4f) he.y = 0.5f;
            if (he.z < 1e-4f) he.z = 0.5f;
            s.box_half_extents = he;
            s.hk_shape = hknpShape::makeBoxFromHalfExtents(hkVector4(he.x, he.y, he.z));
        } else if (s.type == SHAPE_SPHERE) {
            float r = static_cast<float>(variant_to_double(data));
            if (r < 1e-4f) r = 0.5f;
            s.sphere_radius = r;
            s.hk_shape = hknpShape::makeSphere(r);
        } else if (s.type == SHAPE_WORLD_BOUNDARY) {
            s.plane = variant_to_plane(data);
            s.hk_shape = hknpShape::makeBoxFromHalfExtents(hkVector4(2000.0f, 1.0f, 2000.0f));
        }
    }

    GdShapeType shape_get_type(uint64_t rid) {
        auto it = m_shapes.find(rid);
        return it != m_shapes.end() ? it->second.type : SHAPE_BOX;
    }

    void shape_get_data(uint64_t rid, GdVariant* out) {
        auto it = m_shapes.find(rid);
        if (it == m_shapes.end()) {
            g_api.variant_new_nil(out);
            return;
        }
        const ShapeEntry& s = it->second;
        if (s.type == SHAPE_BOX) {
            GdVector3 he = s.box_half_extents;
            g_api.var_from_vec3(out, &he);
        } else if (s.type == SHAPE_SPHERE) {
            double r = s.sphere_radius;
            g_api.var_from_float(out, &r);
        } else if (s.type == SHAPE_WORLD_BOUNDARY) {
            GdPlane p = s.plane;
            g_api.var_from_plane(out, &p);
        } else {
            g_api.variant_new_nil(out);
        }
    }

    // --- Spaces ---
    uint64_t space_create() {
        ensure_havok_init();
        uint64_t rid = alloc_rid();
        auto sp = std::make_unique<SpaceEntry>();
        sp->ensure_world();
        m_spaces[rid] = std::move(sp);
        return rid;
    }

    void space_set_active(uint64_t rid, bool active) {
        auto it = m_spaces.find(rid);
        if (it != m_spaces.end()) it->second->active = active;
    }

    bool space_is_active(uint64_t rid) {
        auto it = m_spaces.find(rid);
        return it != m_spaces.end() ? it->second->active : false;
    }

    // --- Areas (gravity sync) ---
    uint64_t area_create() {
        uint64_t rid = alloc_rid();
        m_areas[rid] = AreaEntry{};
        return rid;
    }

    void area_set_space(uint64_t area_rid, uint64_t space_rid) {
        auto it = m_areas.find(area_rid);
        if (it == m_areas.end()) return;
        it->second.space_rid = space_rid;
        sync_area_gravity(it->second);
    }

    void area_set_param(uint64_t area_rid, int64_t param, const GdVariant* value) {
        auto it = m_areas.find(area_rid);
        if (it == m_areas.end()) return;
        if (param == AREA_PARAM_GRAVITY) {
            it->second.gravity = static_cast<float>(variant_to_double(value));
            sync_area_gravity(it->second);
        } else if (param == AREA_PARAM_GRAVITY_VECTOR) {
            it->second.gravity_vec = variant_to_vec3(value);
            sync_area_gravity(it->second);
        }
    }

    // --- Bodies ---
    uint64_t body_create() {
        uint64_t rid = alloc_rid();
        BodyEntry entry{};
        entry.self_rid = rid;
        m_bodies[rid] = entry;
        return rid;
    }

    void body_set_space(uint64_t body_rid, uint64_t space_rid) {
        auto bit = m_bodies.find(body_rid);
        if (bit == m_bodies.end()) return;
        BodyEntry& b = bit->second;
        if (b.space_rid == space_rid) return;

        detach_body_from_world(b);
        b.space_rid = space_rid;
        if (b.space_rid != 0 && b.shape_rid != 0 && !b.shape_disabled) {
            attach_body_to_world(b);
        }
    }

    uint64_t body_get_space(uint64_t body_rid) {
        auto it = m_bodies.find(body_rid);
        return it != m_bodies.end() ? it->second.space_rid : 0;
    }

    void body_set_mode(uint64_t body_rid, GdBodyMode mode) {
        auto it = m_bodies.find(body_rid);
        if (it == m_bodies.end()) return;
        BodyEntry& b = it->second;
        if (b.mode == mode) return;
        b.mode = mode;
        if (b.in_world) {
            auto sit = m_spaces.find(b.space_rid);
            if (sit != m_spaces.end() && sit->second->world) {
                hknpMotionType::Enum mt = to_hk_motion_type(mode);
                sit->second->world->setBodyMotionType(b.hk_body_id, mt);
                if (mt == hknpMotionType::DYNAMIC) {
                    sit->second->world->setBodyMass(b.hk_body_id, b.mass);
                    sit->second->world->setBodyGravityFactor(b.hk_body_id, b.gravity_scale);
                }
            }
        }
    }

    GdBodyMode body_get_mode(uint64_t body_rid) {
        auto it = m_bodies.find(body_rid);
        return it != m_bodies.end() ? it->second.mode : BODY_MODE_RIGID;
    }

    void body_add_shape(uint64_t body_rid, uint64_t shape_rid, const GdTransform3D& xform, bool disabled) {
        auto it = m_bodies.find(body_rid);
        if (it == m_bodies.end()) return;
        BodyEntry& b = it->second;
        b.shape_rid = shape_rid;
        b.shape_local_xform = xform;
        b.shape_disabled = disabled;
        if (b.space_rid != 0 && !disabled) {
            if (!b.in_world) {
                attach_body_to_world(b);
            } else {
                auto sit = m_spaces.find(b.space_rid);
                auto shit = m_shapes.find(shape_rid);
                if (sit != m_spaces.end() && sit->second->world && shit != m_shapes.end() && shit->second.hk_shape) {
                    sit->second->world->setBodyShape(b.hk_body_id, shit->second.hk_shape);
                }
            }
        }
    }

    void body_set_shape(uint64_t body_rid, int64_t /*idx*/, uint64_t shape_rid) {
        auto it = m_bodies.find(body_rid);
        if (it == m_bodies.end()) return;
        BodyEntry& b = it->second;
        b.shape_rid = shape_rid;
        if (b.in_world) {
            auto sit = m_spaces.find(b.space_rid);
            auto shit = m_shapes.find(shape_rid);
            if (sit != m_spaces.end() && sit->second->world && shit != m_shapes.end() && shit->second.hk_shape) {
                sit->second->world->setBodyShape(b.hk_body_id, shit->second.hk_shape);
            }
        } else if (b.space_rid != 0 && !b.shape_disabled) {
            attach_body_to_world(b);
        }
    }

    void body_clear_shapes(uint64_t body_rid) {
        auto it = m_bodies.find(body_rid);
        if (it == m_bodies.end()) return;
        detach_body_from_world(it->second);
        it->second.shape_rid = 0;
    }

    int64_t body_get_shape_count(uint64_t body_rid) {
        auto it = m_bodies.find(body_rid);
        if (it == m_bodies.end()) return 0;
        return it->second.shape_rid != 0 ? 1 : 0;
    }

    void body_set_param(uint64_t body_rid, int64_t param, const GdVariant* value) {
        auto it = m_bodies.find(body_rid);
        if (it == m_bodies.end()) return;
        BodyEntry& b = it->second;
        float fv = static_cast<float>(variant_to_double(value));
        switch (param) {
            case BODY_PARAM_BOUNCE:
                b.bounce = fv;
                update_body_material(b);
                break;
            case BODY_PARAM_FRICTION:
                b.friction = fv;
                update_body_material(b);
                break;
            case BODY_PARAM_MASS:
                b.mass = fv > 1e-4f ? fv : 1.0f;
                if (b.in_world && b.mode != BODY_MODE_STATIC) {
                    auto sit = m_spaces.find(b.space_rid);
                    if (sit != m_spaces.end() && sit->second->world) {
                        sit->second->world->setBodyMass(b.hk_body_id, b.mass);
                    }
                }
                break;
            case BODY_PARAM_GRAVITY_SCALE:
                b.gravity_scale = fv;
                if (b.in_world && b.mode != BODY_MODE_STATIC) {
                    auto sit = m_spaces.find(b.space_rid);
                    if (sit != m_spaces.end() && sit->second->world) {
                        sit->second->world->setBodyGravityFactor(b.hk_body_id, b.gravity_scale);
                    }
                }
                break;
            case BODY_PARAM_LINEAR_DAMP:
                b.linear_damp = fv >= 0.0f ? fv : 0.0f;
                if (b.in_world && b.mode != BODY_MODE_STATIC) {
                    auto sit = m_spaces.find(b.space_rid);
                    if (sit != m_spaces.end() && sit->second->world) {
                        sit->second->world->setBodyLinearDamping(b.hk_body_id, b.linear_damp);
                    }
                }
                break;
            case BODY_PARAM_ANGULAR_DAMP:
                b.angular_damp = fv >= 0.0f ? fv : 0.0f;
                if (b.in_world && b.mode != BODY_MODE_STATIC) {
                    auto sit = m_spaces.find(b.space_rid);
                    if (sit != m_spaces.end() && sit->second->world) {
                        sit->second->world->setBodyAngularDamping(b.hk_body_id, b.angular_damp);
                    }
                }
                break;
            default:
                break;
        }
    }

    void body_get_param(uint64_t body_rid, int64_t param, GdVariant* out) {
        auto it = m_bodies.find(body_rid);
        if (it == m_bodies.end()) {
            double z = 0.0;
            g_api.var_from_float(out, &z);
            return;
        }
        const BodyEntry& b = it->second;
        double v = 0.0;
        switch (param) {
            case BODY_PARAM_BOUNCE: v = b.bounce; break;
            case BODY_PARAM_FRICTION: v = b.friction; break;
            case BODY_PARAM_MASS: v = b.mass; break;
            case BODY_PARAM_GRAVITY_SCALE: v = b.gravity_scale; break;
            case BODY_PARAM_LINEAR_DAMP: v = b.linear_damp; break;
            case BODY_PARAM_ANGULAR_DAMP: v = b.angular_damp; break;
            default: v = 0.0; break;
        }
        g_api.var_from_float(out, &v);
    }

    void body_set_state(uint64_t body_rid, int64_t state, const GdVariant* value) {
        auto it = m_bodies.find(body_rid);
        if (it == m_bodies.end()) return;
        BodyEntry& b = it->second;
        switch (state) {
            case BODY_STATE_TRANSFORM: {
                b.transform = variant_to_xform3d(value);
                if (b.in_world) {
                    auto sit = m_spaces.find(b.space_rid);
                    if (sit != m_spaces.end() && sit->second->world) {
                        hkRotation rot;
                        hkVector4d pos;
                        compute_world_transform(b, rot, pos);
                        sit->second->world->setBodyTransform(b.hk_body_id, rot, pos);
                    }
                }
                break;
            }
            case BODY_STATE_LINEAR_VELOCITY: {
                b.linear_velocity = variant_to_vec3(value);
                if (b.in_world && b.mode != BODY_MODE_STATIC) {
                    auto sit = m_spaces.find(b.space_rid);
                    if (sit != m_spaces.end() && sit->second->world) {
                        sit->second->world->setBodyLinearVelocity(
                            b.hk_body_id, hkVector4(b.linear_velocity.x, b.linear_velocity.y, b.linear_velocity.z));
                    }
                }
                break;
            }
            case BODY_STATE_ANGULAR_VELOCITY: {
                b.angular_velocity = variant_to_vec3(value);
                if (b.in_world && b.mode != BODY_MODE_STATIC) {
                    auto sit = m_spaces.find(b.space_rid);
                    if (sit != m_spaces.end() && sit->second->world) {
                        sit->second->world->setBodyAngularVelocity(
                            b.hk_body_id, hkVector4(b.angular_velocity.x, b.angular_velocity.y, b.angular_velocity.z));
                    }
                }
                break;
            }
            case BODY_STATE_SLEEPING: {
                b.sleeping = variant_to_bool(value);
                if (b.in_world && b.mode != BODY_MODE_STATIC) {
                    auto sit = m_spaces.find(b.space_rid);
                    if (sit != m_spaces.end() && sit->second->world) {
                        if (b.sleeping) {
                            sit->second->world->setBodyActivationState(b.hk_body_id, hknpActivationState::INACTIVE);
                        } else {
                            sit->second->world->setBodyActivationState(b.hk_body_id, hknpActivationState::ACTIVE);
                        }
                    }
                }
                break;
            }
            case BODY_STATE_CAN_SLEEP: {
                b.can_sleep = variant_to_bool(value);
                break;
            }
            default:
                break;
        }
    }

    void body_get_state(uint64_t body_rid, int64_t state, GdVariant* out) {
        auto it = m_bodies.find(body_rid);
        if (it == m_bodies.end()) {
            g_api.variant_new_nil(out);
            return;
        }
        BodyEntry& b = it->second;
        switch (state) {
            case BODY_STATE_TRANSFORM: {
                GdTransform3D x = b.transform;
                if (b.in_world) {
                    auto sit = m_spaces.find(b.space_rid);
                    if (sit != m_spaces.end() && sit->second->world) {
                        x = havok_to_godot_xform(sit->second->world->getBodyTransform(b.hk_body_id));
                    }
                }
                g_api.var_from_xform3d(out, &x);
                return;
            }
            case BODY_STATE_LINEAR_VELOCITY: {
                GdVector3 v = b.linear_velocity;
                if (b.in_world && b.mode != BODY_MODE_STATIC) {
                    auto sit = m_spaces.find(b.space_rid);
                    if (sit != m_spaces.end() && sit->second->world) {
                        hkVector4 lv = sit->second->world->getBodyLinearVelocity(b.hk_body_id);
                        v = {lv(0), lv(1), lv(2)};
                    }
                }
                g_api.var_from_vec3(out, &v);
                return;
            }
            case BODY_STATE_ANGULAR_VELOCITY: {
                GdVector3 v = b.angular_velocity;
                if (b.in_world && b.mode != BODY_MODE_STATIC) {
                    auto sit = m_spaces.find(b.space_rid);
                    if (sit != m_spaces.end() && sit->second->world) {
                        hkVector4 av;
                        sit->second->world->getBodyAngularVelocity(b.hk_body_id, av);
                        v = {av(0), av(1), av(2)};
                    }
                }
                g_api.var_from_vec3(out, &v);
                return;
            }
            case BODY_STATE_SLEEPING: {
                GDExtensionBool sl = b.sleeping ? 1 : 0;
                if (b.in_world) {
                    auto sit = m_spaces.find(b.space_rid);
                    if (sit != m_spaces.end() && sit->second->world) {
                        sl = (sit->second->world->getBodyActivationState(b.hk_body_id) == hknpActivationState::ACTIVE) ? 0 : 1;
                    }
                }
                g_api.var_from_bool(out, &sl);
                return;
            }
            case BODY_STATE_CAN_SLEEP: {
                GDExtensionBool cs = b.can_sleep ? 1 : 0;
                g_api.var_from_bool(out, &cs);
                return;
            }
            default:
                g_api.variant_new_nil(out);
                return;
        }
    }

    void body_apply_central_impulse(uint64_t body_rid, const GdVector3& impulse) {
        auto it = m_bodies.find(body_rid);
        if (it == m_bodies.end()) return;
        BodyEntry& b = it->second;
        if (!b.in_world || b.mode == BODY_MODE_STATIC) return;
        auto sit = m_spaces.find(b.space_rid);
        if (sit == m_spaces.end() || !sit->second->world) return;
        sit->second->world->applyBodyLinearImpulse(b.hk_body_id, hkVector4(impulse.x, impulse.y, impulse.z));
    }

    void body_apply_impulse(uint64_t body_rid, const GdVector3& impulse, const GdVector3& pos) {
        auto it = m_bodies.find(body_rid);
        if (it == m_bodies.end()) return;
        BodyEntry& b = it->second;
        if (!b.in_world || b.mode == BODY_MODE_STATIC) return;
        auto sit = m_spaces.find(b.space_rid);
        if (sit == m_spaces.end() || !sit->second->world) return;
        const hkPreciseTransform& xf = sit->second->world->getBodyTransform(b.hk_body_id);
        hkVector4d worldPos = xf.getTranslation();
        worldPos.add(hkVector4d(pos.x, pos.y, pos.z));
        sit->second->world->applyBodyImpulseAt(
            b.hk_body_id, hkVector4(impulse.x, impulse.y, impulse.z), worldPos);
    }

    void body_apply_torque_impulse(uint64_t body_rid, const GdVector3& impulse) {
        auto it = m_bodies.find(body_rid);
        if (it == m_bodies.end()) return;
        BodyEntry& b = it->second;
        if (!b.in_world || b.mode == BODY_MODE_STATIC) return;
        auto sit = m_spaces.find(b.space_rid);
        if (sit == m_spaces.end() || !sit->second->world) return;
        sit->second->world->applyBodyAngularImpulse(b.hk_body_id, hkVector4(impulse.x, impulse.y, impulse.z));
    }

    void body_set_collision_layer(uint64_t body_rid, int64_t layer) {
        auto it = m_bodies.find(body_rid);
        if (it != m_bodies.end()) it->second.collision_layer = static_cast<uint32_t>(layer);
    }

    int64_t body_get_collision_layer(uint64_t body_rid) {
        auto it = m_bodies.find(body_rid);
        return it != m_bodies.end() ? static_cast<int64_t>(it->second.collision_layer) : 0;
    }

    void body_set_collision_mask(uint64_t body_rid, int64_t mask) {
        auto it = m_bodies.find(body_rid);
        if (it != m_bodies.end()) it->second.collision_mask = static_cast<uint32_t>(mask);
    }

    int64_t body_get_collision_mask(uint64_t body_rid) {
        auto it = m_bodies.find(body_rid);
        return it != m_bodies.end() ? static_cast<int64_t>(it->second.collision_mask) : 0;
    }

    void free_rid(uint64_t rid) {
        auto bit = m_bodies.find(rid);
        if (bit != m_bodies.end()) {
            detach_body_from_world(bit->second);
            m_bodies.erase(bit);
            return;
        }
        auto ait = m_areas.find(rid);
        if (ait != m_areas.end()) {
            m_areas.erase(ait);
            return;
        }
        auto shit = m_shapes.find(rid);
        if (shit != m_shapes.end()) {
            m_shapes.erase(shit);
            return;
        }
        auto sit = m_spaces.find(rid);
        if (sit != m_spaces.end()) {
            for (auto& kv : m_bodies) {
                if (kv.second.space_rid == rid) {
                    if (kv.second.self_rid < m_fast_bodies.size()) {
                        m_fast_bodies[static_cast<size_t>(kv.second.self_rid)] = FastBodySlot{nullptr, hknpBodyId::invalid()};
                    }
                    kv.second.space_rid = 0;
                    kv.second.in_world = false;
                    kv.second.hk_body_id = hknpBodyId::invalid();
                }
            }
            sit->second->world = nullptr;
            sit->second->block_allocator.reset();
            m_spaces.erase(sit);
        }
    }

    // --- Simulation Step ---
    void step(double delta) {
        if (!m_active || delta <= 0.0) return;

        auto t0 = std::chrono::steady_clock::now();
        int64_t collide_us_total = 0;
        int64_t solve_us_total = 0;
        int64_t total_bodies = 0;
        int64_t active_bodies = 0;

        hknpStepInput stepInput;
        stepInput.m_deltaTime = static_cast<hkReal>(delta);
        stepInput.m_maxNumThreads = m_num_threads;

        for (auto& kv : m_spaces) {
            SpaceEntry* sp = kv.second.get();
            if (!sp->active || !sp->world) continue;
            hknpWorld* world = sp->world;
            uint32_t nb = world->getNumBodies();
            total_bodies += nb;
            if (nb == 0) continue;

            // Phase 1: Collide tasks
            auto tc0 = std::chrono::steady_clock::now();
            {
                hknpTaskGraph taskGraph;
                world->generateCollideTasks(stepInput, taskGraph);
                run_task_graph(taskGraph);
            }
            auto tc1 = std::chrono::steady_clock::now();
            collide_us_total += std::chrono::duration_cast<std::chrono::microseconds>(tc1 - tc0).count();

            // Phase 2: Solve + Integrate tasks
            auto ts0 = std::chrono::steady_clock::now();
            {
                hknpTaskGraph taskGraph;
                world->generateSolveTasks(taskGraph);
                run_task_graph(taskGraph);
            }
            auto ts1 = std::chrono::steady_clock::now();
            solve_us_total += std::chrono::duration_cast<std::chrono::microseconds>(ts1 - ts0).count();

            for (auto activeId : world->getActiveBodies()) {
                (void)activeId;
                ++active_bodies;
            }
        }

        auto t1 = std::chrono::steady_clock::now();
        int64_t step_us = std::chrono::duration_cast<std::chrono::microseconds>(t1 - t0).count();

        m_last_active_objects = active_bodies;
        g_telemetry.last_step_us.store(step_us, std::memory_order_relaxed);
        g_telemetry.last_collide_us.store(collide_us_total, std::memory_order_relaxed);
        g_telemetry.last_solve_us.store(solve_us_total, std::memory_order_relaxed);
        g_telemetry.active_bodies.store(active_bodies, std::memory_order_relaxed);
        g_telemetry.total_bodies.store(total_bodies, std::memory_order_relaxed);
        g_telemetry.step_count.fetch_add(1, std::memory_order_relaxed);
    }

    int64_t get_process_info(int64_t info) {
        if (info == INFO_ACTIVE_OBJECTS) return m_last_active_objects;
        return 0;
    }

    // Zero-copy direct C++ batch sync from hknpWorld -> MultiMesh 16-float buffer
    int64_t batch_fill_multimesh_buffer(
        const int64_t* rids,
        const float* custom_r,
        int64_t count,
        float* dst) const {
        if (!rids || !dst || count <= 0) return 0;
        const size_t table_sz = m_fast_bodies.size();
        int64_t written = 0;
        for (int64_t i = 0; i < count; ++i) {
            const uint64_t rid = static_cast<uint64_t>(rids[i]);
            float* out = dst + i * 16;
            if (rid < table_sz && m_fast_bodies[rid].world != nullptr) {
                const FastBodySlot& slot = m_fast_bodies[rid];
                const hkPreciseTransform& hk = slot.world->getBodyTransform(slot.id);
                const hkRotation& r = hk.getRotation();
                const hkVector4& c0 = r.getColumn<0>();
                const hkVector4& c1 = r.getColumn<1>();
                const hkVector4& c2 = r.getColumn<2>();
                const hkVector4d& p = hk.getTranslation();
                out[0]  = c0(0); out[1]  = c1(0); out[2]  = c2(0); out[3]  = static_cast<float>(p(0));
                out[4]  = c0(1); out[5]  = c1(1); out[6]  = c2(1); out[7]  = static_cast<float>(p(1));
                out[8]  = c0(2); out[9]  = c1(2); out[10] = c2(2); out[11] = static_cast<float>(p(2));
                out[12] = custom_r ? custom_r[i] : 0.0f;
                out[13] = 0.0f; out[14] = 0.0f; out[15] = 0.0f;
                ++written;
            }
        }
        return written;
    }

private:
    uint64_t alloc_rid() {
        return m_next_rid++;
    }

    static hknpMotionType::Enum to_hk_motion_type(GdBodyMode mode) {
        switch (mode) {
            case BODY_MODE_STATIC: return hknpMotionType::STATIC;
            case BODY_MODE_KINEMATIC: return hknpMotionType::KEYFRAMED;
            case BODY_MODE_RIGID:
            case BODY_MODE_RIGID_LINEAR:
            default:
                return hknpMotionType::DYNAMIC;
        }
    }

    void sync_area_gravity(const AreaEntry& a) {
        if (a.space_rid == 0) return;
        auto sit = m_spaces.find(a.space_rid);
        if (sit == m_spaces.end()) return;
        hkVector4 g(a.gravity_vec.x * a.gravity, a.gravity_vec.y * a.gravity, a.gravity_vec.z * a.gravity);
        sit->second->gravity = g;
        if (sit->second->world) {
            sit->second->world->setGravity(g);
        }
    }

    void compute_world_transform(const BodyEntry& b, hkRotation& rotOut, hkVector4d& posOut) {
        godot_to_havok_xform(b.transform, rotOut, posOut);
        auto shit = m_shapes.find(b.shape_rid);
        if (shit != m_shapes.end() && shit->second.type == SHAPE_WORLD_BOUNDARY) {
            // Shift a 2m-thick huge box down by 1.0m along the plane normal so top face sits on plane.d
            const GdPlane& pl = shit->second.plane;
            float nx = pl.normal.x, ny = pl.normal.y, nz = pl.normal.z;
            float len = std::sqrt(nx * nx + ny * ny + nz * nz);
            if (len > 1e-6f) { nx /= len; ny /= len; nz /= len; }
            else { nx = 0.0f; ny = 1.0f; nz = 0.0f; }
            posOut.add(hkVector4d(nx * (pl.d - 1.0f), ny * (pl.d - 1.0f), nz * (pl.d - 1.0f)));
        }
    }

    void attach_body_to_world(BodyEntry& b) {
        if (b.in_world || b.space_rid == 0 || b.shape_rid == 0) return;
        auto sit = m_spaces.find(b.space_rid);
        auto shit = m_shapes.find(b.shape_rid);
        if (sit == m_spaces.end() || shit == m_shapes.end() || !shit->second.hk_shape) return;

        SpaceEntry* sp = sit->second.get();
        sp->ensure_world();

        hknpBodyCinfo cinfo;
        cinfo.m_shape = shit->second.hk_shape;
        cinfo.m_materialId = sp->get_or_create_material(b.friction, b.bounce);
        cinfo.m_motionType = to_hk_motion_type(b.mode);

        hkRotation rot;
        hkVector4d pos;
        compute_world_transform(b, rot, pos);
        cinfo.m_position = pos;
        cinfo.m_orientation.set(rot);

        if (cinfo.m_motionType == hknpMotionType::DYNAMIC) {
            cinfo.m_mass = b.mass > 1e-4f ? b.mass : 1.0f;
        }

        hknpBodyId id = sp->world->allocateBody(cinfo);
        if (!id.isValid()) return;
        sp->world->addBody(id);

        if (cinfo.m_motionType == hknpMotionType::DYNAMIC) {
            if (b.gravity_scale != 1.0f) {
                sp->world->setBodyGravityFactor(id, b.gravity_scale);
            }
            if (b.linear_damp > 0.0f) {
                sp->world->setBodyLinearDamping(id, b.linear_damp);
            }
            if (b.angular_damp > 0.0f) {
                sp->world->setBodyAngularDamping(id, b.angular_damp);
            }
            if (b.linear_velocity.x != 0.0f || b.linear_velocity.y != 0.0f || b.linear_velocity.z != 0.0f) {
                sp->world->setBodyLinearVelocity(id, hkVector4(b.linear_velocity.x, b.linear_velocity.y, b.linear_velocity.z));
            }
            if (b.angular_velocity.x != 0.0f || b.angular_velocity.y != 0.0f || b.angular_velocity.z != 0.0f) {
                sp->world->setBodyAngularVelocity(id, hkVector4(b.angular_velocity.x, b.angular_velocity.y, b.angular_velocity.z));
            }
            if (b.sleeping) {
                sp->world->setBodyActivationState(id, hknpActivationState::INACTIVE);
            }
        }

        b.hk_body_id = id;
        b.in_world = true;
        if (b.self_rid >= m_fast_bodies.size()) {
            m_fast_bodies.resize(static_cast<size_t>(b.self_rid) + 1);
        }
        m_fast_bodies[static_cast<size_t>(b.self_rid)] = FastBodySlot{sp->world, id};
    }

    void detach_body_from_world(BodyEntry& b) {
        if (!b.in_world) return;
        if (b.self_rid < m_fast_bodies.size()) {
            m_fast_bodies[static_cast<size_t>(b.self_rid)] = FastBodySlot{nullptr, hknpBodyId::invalid()};
        }
        auto sit = m_spaces.find(b.space_rid);
        if (sit != m_spaces.end() && sit->second->world && b.hk_body_id.isValid()) {
            hknpWorld* world = sit->second->world;
            if (world->isBodyAdded(b.hk_body_id)) {
                world->removeBodies(&b.hk_body_id, 1);
            }
            if (world->isBodyValid(b.hk_body_id)) {
                world->destroyBodies(&b.hk_body_id, 1);
            }
        }
        b.hk_body_id = hknpBodyId::invalid();
        b.in_world = false;
    }

    void update_body_material(BodyEntry& b) {
        if (!b.in_world) return;
        auto sit = m_spaces.find(b.space_rid);
        if (sit == m_spaces.end() || !sit->second->world) return;
        hknpMaterialId mid = sit->second->get_or_create_material(b.friction, b.bounce);
        sit->second->world->setBodyMaterial(b.hk_body_id, mid);
    }

    void run_task_graph(hknpTaskGraph& taskGraph) {
        hkTaskQueue::Handle finalHandle = taskGraph.submitToTaskQueue(*m_task_queue);
        for (auto& w : m_workers) {
            w->processTasks(finalHandle);
        }
        m_task_queue->processUntilFinished(finalHandle);
        for (auto& w : m_workers) {
            w->waitUntilFinished();
        }
        taskGraph.freeTaskQueueHandles(*m_task_queue);
    }

    GDExtensionObjectPtr m_owner = nullptr;
    uint64_t m_next_rid = 1;
    bool m_active = true;
    int m_num_threads = 1;
    int64_t m_last_active_objects = 0;

    std::unique_ptr<hkDefaultTaskQueue> m_task_queue;
    std::vector<std::unique_ptr<HavokWorkerThread>> m_workers;

    std::unordered_map<uint64_t, ShapeEntry> m_shapes;
    std::unordered_map<uint64_t, std::unique_ptr<SpaceEntry>> m_spaces;
    std::unordered_map<uint64_t, AreaEntry> m_areas;
    std::unordered_map<uint64_t, BodyEntry> m_bodies;
    std::vector<FastBodySlot> m_fast_bodies;
};

// ---------------------------------------------------------------------------
// Virtual Method Dispatch Table for PhysicsServer3DExtension
// ---------------------------------------------------------------------------
using VirtualHandlerFn = void (*)(HavokPhysicsServer3D* self, const GDExtensionConstTypePtr* args, GDExtensionTypePtr ret);

struct VirtualEntry {
    const char* name_cstr;
    GdStringName name_sn;
    VirtualHandlerFn fn;
};

static std::vector<VirtualEntry> g_virtual_table;

static void v_init(HavokPhysicsServer3D* s, const GDExtensionConstTypePtr*, GDExtensionTypePtr) { s->init(); }
static void v_finish(HavokPhysicsServer3D* s, const GDExtensionConstTypePtr*, GDExtensionTypePtr) { s->finish(); }
static void v_set_active(HavokPhysicsServer3D* s, const GDExtensionConstTypePtr* a, GDExtensionTypePtr) {
    s->set_active(*static_cast<const GDExtensionBool*>(a[0]) != 0);
}
static void v_step(HavokPhysicsServer3D* s, const GDExtensionConstTypePtr* a, GDExtensionTypePtr) {
    s->step(*static_cast<const double*>(a[0]));
}
static void v_sync(HavokPhysicsServer3D*, const GDExtensionConstTypePtr*, GDExtensionTypePtr) {}
static void v_flush_queries(HavokPhysicsServer3D*, const GDExtensionConstTypePtr*, GDExtensionTypePtr) {}
static void v_is_flushing_queries(HavokPhysicsServer3D*, const GDExtensionConstTypePtr*, GDExtensionTypePtr r) {
    *static_cast<GDExtensionBool*>(r) = 0;
}
static void v_free_rid(HavokPhysicsServer3D* s, const GDExtensionConstTypePtr* a, GDExtensionTypePtr) {
    s->free_rid(*static_cast<const uint64_t*>(a[0]));
}
static void v_get_process_info(HavokPhysicsServer3D* s, const GDExtensionConstTypePtr* a, GDExtensionTypePtr r) {
    *static_cast<int64_t*>(r) = s->get_process_info(*static_cast<const int64_t*>(a[0]));
}

// Shapes
static void v_box_shape_create(HavokPhysicsServer3D* s, const GDExtensionConstTypePtr*, GDExtensionTypePtr r) {
    *static_cast<uint64_t*>(r) = s->create_shape(SHAPE_BOX);
}
static void v_sphere_shape_create(HavokPhysicsServer3D* s, const GDExtensionConstTypePtr*, GDExtensionTypePtr r) {
    *static_cast<uint64_t*>(r) = s->create_shape(SHAPE_SPHERE);
}
static void v_capsule_shape_create(HavokPhysicsServer3D* s, const GDExtensionConstTypePtr*, GDExtensionTypePtr r) {
    *static_cast<uint64_t*>(r) = s->create_shape(SHAPE_CAPSULE);
}
static void v_world_boundary_shape_create(HavokPhysicsServer3D* s, const GDExtensionConstTypePtr*, GDExtensionTypePtr r) {
    *static_cast<uint64_t*>(r) = s->create_shape(SHAPE_WORLD_BOUNDARY);
}
static void v_shape_set_data(HavokPhysicsServer3D* s, const GDExtensionConstTypePtr* a, GDExtensionTypePtr) {
    s->shape_set_data(*static_cast<const uint64_t*>(a[0]), static_cast<const GdVariant*>(a[1]));
}
static void v_shape_get_type(HavokPhysicsServer3D* s, const GDExtensionConstTypePtr* a, GDExtensionTypePtr r) {
    *static_cast<int64_t*>(r) = static_cast<int64_t>(s->shape_get_type(*static_cast<const uint64_t*>(a[0])));
}
static void v_shape_get_data(HavokPhysicsServer3D* s, const GDExtensionConstTypePtr* a, GDExtensionTypePtr r) {
    s->shape_get_data(*static_cast<const uint64_t*>(a[0]), static_cast<GdVariant*>(r));
}

// Spaces
static void v_space_create(HavokPhysicsServer3D* s, const GDExtensionConstTypePtr*, GDExtensionTypePtr r) {
    *static_cast<uint64_t*>(r) = s->space_create();
}
static void v_space_set_active(HavokPhysicsServer3D* s, const GDExtensionConstTypePtr* a, GDExtensionTypePtr) {
    s->space_set_active(*static_cast<const uint64_t*>(a[0]), *static_cast<const GDExtensionBool*>(a[1]) != 0);
}
static void v_space_is_active(HavokPhysicsServer3D* s, const GDExtensionConstTypePtr* a, GDExtensionTypePtr r) {
    *static_cast<GDExtensionBool*>(r) = s->space_is_active(*static_cast<const uint64_t*>(a[0])) ? 1 : 0;
}
static void v_space_set_param(HavokPhysicsServer3D*, const GDExtensionConstTypePtr*, GDExtensionTypePtr) {}
static void v_space_get_param(HavokPhysicsServer3D*, const GDExtensionConstTypePtr*, GDExtensionTypePtr r) {
    *static_cast<double*>(r) = 0.0;
}

// Areas
static void v_area_create(HavokPhysicsServer3D* s, const GDExtensionConstTypePtr*, GDExtensionTypePtr r) {
    *static_cast<uint64_t*>(r) = s->area_create();
}
static void v_area_set_space(HavokPhysicsServer3D* s, const GDExtensionConstTypePtr* a, GDExtensionTypePtr) {
    s->area_set_space(*static_cast<const uint64_t*>(a[0]), *static_cast<const uint64_t*>(a[1]));
}
static void v_area_set_param(HavokPhysicsServer3D* s, const GDExtensionConstTypePtr* a, GDExtensionTypePtr) {
    s->area_set_param(*static_cast<const uint64_t*>(a[0]), *static_cast<const int64_t*>(a[1]), static_cast<const GdVariant*>(a[2]));
}

// Bodies
static void v_body_create(HavokPhysicsServer3D* s, const GDExtensionConstTypePtr*, GDExtensionTypePtr r) {
    *static_cast<uint64_t*>(r) = s->body_create();
}
static void v_body_set_space(HavokPhysicsServer3D* s, const GDExtensionConstTypePtr* a, GDExtensionTypePtr) {
    s->body_set_space(*static_cast<const uint64_t*>(a[0]), *static_cast<const uint64_t*>(a[1]));
}
static void v_body_get_space(HavokPhysicsServer3D* s, const GDExtensionConstTypePtr* a, GDExtensionTypePtr r) {
    *static_cast<uint64_t*>(r) = s->body_get_space(*static_cast<const uint64_t*>(a[0]));
}
static void v_body_set_mode(HavokPhysicsServer3D* s, const GDExtensionConstTypePtr* a, GDExtensionTypePtr) {
    s->body_set_mode(*static_cast<const uint64_t*>(a[0]), static_cast<GdBodyMode>(*static_cast<const int64_t*>(a[1])));
}
static void v_body_get_mode(HavokPhysicsServer3D* s, const GDExtensionConstTypePtr* a, GDExtensionTypePtr r) {
    *static_cast<int64_t*>(r) = static_cast<int64_t>(s->body_get_mode(*static_cast<const uint64_t*>(a[0])));
}
static void v_body_add_shape(HavokPhysicsServer3D* s, const GDExtensionConstTypePtr* a, GDExtensionTypePtr) {
    s->body_add_shape(
        *static_cast<const uint64_t*>(a[0]),
        *static_cast<const uint64_t*>(a[1]),
        *static_cast<const GdTransform3D*>(a[2]),
        *static_cast<const GDExtensionBool*>(a[3]) != 0);
}
static void v_body_set_shape(HavokPhysicsServer3D* s, const GDExtensionConstTypePtr* a, GDExtensionTypePtr) {
    s->body_set_shape(*static_cast<const uint64_t*>(a[0]), *static_cast<const int64_t*>(a[1]), *static_cast<const uint64_t*>(a[2]));
}
static void v_body_clear_shapes(HavokPhysicsServer3D* s, const GDExtensionConstTypePtr* a, GDExtensionTypePtr) {
    s->body_clear_shapes(*static_cast<const uint64_t*>(a[0]));
}
static void v_body_get_shape_count(HavokPhysicsServer3D* s, const GDExtensionConstTypePtr* a, GDExtensionTypePtr r) {
    *static_cast<int64_t*>(r) = s->body_get_shape_count(*static_cast<const uint64_t*>(a[0]));
}
static void v_body_set_param(HavokPhysicsServer3D* s, const GDExtensionConstTypePtr* a, GDExtensionTypePtr) {
    s->body_set_param(*static_cast<const uint64_t*>(a[0]), *static_cast<const int64_t*>(a[1]), static_cast<const GdVariant*>(a[2]));
}
static void v_body_get_param(HavokPhysicsServer3D* s, const GDExtensionConstTypePtr* a, GDExtensionTypePtr r) {
    s->body_get_param(*static_cast<const uint64_t*>(a[0]), *static_cast<const int64_t*>(a[1]), static_cast<GdVariant*>(r));
}
static void v_body_set_state(HavokPhysicsServer3D* s, const GDExtensionConstTypePtr* a, GDExtensionTypePtr) {
    s->body_set_state(*static_cast<const uint64_t*>(a[0]), *static_cast<const int64_t*>(a[1]), static_cast<const GdVariant*>(a[2]));
}
static void v_body_get_state(HavokPhysicsServer3D* s, const GDExtensionConstTypePtr* a, GDExtensionTypePtr r) {
    s->body_get_state(*static_cast<const uint64_t*>(a[0]), *static_cast<const int64_t*>(a[1]), static_cast<GdVariant*>(r));
}
static void v_body_apply_central_impulse(HavokPhysicsServer3D* s, const GDExtensionConstTypePtr* a, GDExtensionTypePtr) {
    s->body_apply_central_impulse(*static_cast<const uint64_t*>(a[0]), *static_cast<const GdVector3*>(a[1]));
}
static void v_body_apply_impulse(HavokPhysicsServer3D* s, const GDExtensionConstTypePtr* a, GDExtensionTypePtr) {
    s->body_apply_impulse(*static_cast<const uint64_t*>(a[0]), *static_cast<const GdVector3*>(a[1]), *static_cast<const GdVector3*>(a[2]));
}
static void v_body_apply_torque_impulse(HavokPhysicsServer3D* s, const GDExtensionConstTypePtr* a, GDExtensionTypePtr) {
    s->body_apply_torque_impulse(*static_cast<const uint64_t*>(a[0]), *static_cast<const GdVector3*>(a[1]));
}
static void v_body_set_collision_layer(HavokPhysicsServer3D* s, const GDExtensionConstTypePtr* a, GDExtensionTypePtr) {
    s->body_set_collision_layer(*static_cast<const uint64_t*>(a[0]), *static_cast<const int64_t*>(a[1]));
}
static void v_body_get_collision_layer(HavokPhysicsServer3D* s, const GDExtensionConstTypePtr* a, GDExtensionTypePtr r) {
    *static_cast<int64_t*>(r) = s->body_get_collision_layer(*static_cast<const uint64_t*>(a[0]));
}
static void v_body_set_collision_mask(HavokPhysicsServer3D* s, const GDExtensionConstTypePtr* a, GDExtensionTypePtr) {
    s->body_set_collision_mask(*static_cast<const uint64_t*>(a[0]), *static_cast<const int64_t*>(a[1]));
}
static void v_body_get_collision_mask(HavokPhysicsServer3D* s, const GDExtensionConstTypePtr* a, GDExtensionTypePtr r) {
    *static_cast<int64_t*>(r) = s->body_get_collision_mask(*static_cast<const uint64_t*>(a[0]));
}
static void v_noop(HavokPhysicsServer3D*, const GDExtensionConstTypePtr*, GDExtensionTypePtr) {}

static void init_virtual_table() {
    auto add = [](const char* name, VirtualHandlerFn fn) {
        g_virtual_table.push_back(VirtualEntry{name, make_sn(name), fn});
    };
    add("_init", v_init);
    add("_finish", v_finish);
    add("_set_active", v_set_active);
    add("_step", v_step);
    add("_sync", v_sync);
    add("_end_sync", v_noop);
    add("_flush_queries", v_flush_queries);
    add("_is_flushing_queries", v_is_flushing_queries);
    add("_free_rid", v_free_rid);
    add("_get_process_info", v_get_process_info);

    add("_box_shape_create", v_box_shape_create);
    add("_sphere_shape_create", v_sphere_shape_create);
    add("_capsule_shape_create", v_capsule_shape_create);
    add("_world_boundary_shape_create", v_world_boundary_shape_create);
    add("_shape_set_data", v_shape_set_data);
    add("_shape_get_type", v_shape_get_type);
    add("_shape_get_data", v_shape_get_data);

    add("_space_create", v_space_create);
    add("_space_set_active", v_space_set_active);
    add("_space_is_active", v_space_is_active);
    add("_space_set_param", v_space_set_param);
    add("_space_get_param", v_space_get_param);

    add("_area_create", v_area_create);
    add("_area_set_space", v_area_set_space);
    add("_area_set_param", v_area_set_param);

    add("_body_create", v_body_create);
    add("_body_set_space", v_body_set_space);
    add("_body_get_space", v_body_get_space);
    add("_body_set_mode", v_body_set_mode);
    add("_body_get_mode", v_body_get_mode);
    add("_body_add_shape", v_body_add_shape);
    add("_body_set_shape", v_body_set_shape);
    add("_body_clear_shapes", v_body_clear_shapes);
    add("_body_get_shape_count", v_body_get_shape_count);
    add("_body_set_param", v_body_set_param);
    add("_body_get_param", v_body_get_param);
    add("_body_set_state", v_body_set_state);
    add("_body_get_state", v_body_get_state);
    add("_body_apply_central_impulse", v_body_apply_central_impulse);
    add("_body_apply_impulse", v_body_apply_impulse);
    add("_body_apply_torque_impulse", v_body_apply_torque_impulse);
    add("_body_set_collision_layer", v_body_set_collision_layer);
    add("_body_get_collision_layer", v_body_get_collision_layer);
    add("_body_set_collision_mask", v_body_set_collision_mask);
    add("_body_get_collision_mask", v_body_get_collision_mask);
    add("_body_set_ray_pickable", v_noop);
    add("_body_reset_mass_properties", v_noop);
    add("_body_set_state_sync_callback", v_noop);
    add("_body_set_force_integration_callback", v_noop);
    add("_body_set_enable_continuous_collision_detection", v_noop);
    add("_body_set_collision_priority", v_noop);
    add("_body_set_shape_transform", v_noop);
    add("_body_set_shape_disabled", v_noop);
}

static void clear_virtual_table() {
    for (auto& e : g_virtual_table) {
        free_sn(e.name_sn);
    }
    g_virtual_table.clear();
}

// ---------------------------------------------------------------------------
// GDExtension ClassDB callbacks for HavokPhysicsServer3D
// ---------------------------------------------------------------------------
static GdStringName g_sn_havok_server;
static GdStringName g_sn_parent_server;
static GdStringName g_sn_havok_stats;
static GdStringName g_sn_object;

static const GDExtensionInstanceBindingCallbacks g_binding_callbacks = {nullptr, nullptr, nullptr};

static GDExtensionObjectPtr server_create_instance(void*, GDExtensionBool) {
    GDExtensionObjectPtr obj = g_api.classdb_construct_object2(&g_sn_parent_server);
    auto* inst = new HavokPhysicsServer3D(obj);
    g_api.object_set_instance(obj, &g_sn_havok_server, inst);
    g_api.object_set_instance_binding(obj, g_api.library, inst, &g_binding_callbacks);
    return obj;
}

static void server_free_instance(void*, GDExtensionClassInstancePtr p_instance) {
    delete static_cast<HavokPhysicsServer3D*>(p_instance);
}

static void* server_get_virtual_call_data(void*, GDExtensionConstStringNamePtr p_name, uint32_t) {
    const uint64_t key = *static_cast<const uint64_t*>(p_name);
    for (auto& e : g_virtual_table) {
        if (e.name_sn.opaque == key) {
            return reinterpret_cast<void*>(e.fn);
        }
    }
    return nullptr;
}

static void server_call_virtual_with_data(
    GDExtensionClassInstancePtr p_instance,
    GDExtensionConstStringNamePtr,
    void* p_virtual_call_userdata,
    const GDExtensionConstTypePtr* p_args,
    GDExtensionTypePtr r_ret) {
    auto fn = reinterpret_cast<VirtualHandlerFn>(p_virtual_call_userdata);
    if (fn && p_instance) {
        fn(static_cast<HavokPhysicsServer3D*>(p_instance), p_args, r_ret);
    }
}

// Custom Callable callback for PhysicsServer3DManager::register_server
static void create_havok_server_callable(
    void*,
    const GDExtensionConstVariantPtr*,
    GDExtensionInt,
    GDExtensionVariantPtr r_return,
    GDExtensionCallError* r_error) {
    GDExtensionObjectPtr obj = server_create_instance(nullptr, 0);
    g_api.var_from_object(r_return, &obj);
    if (r_error) {
        r_error->error = GDEXTENSION_CALL_OK;
    }
}

static GDExtensionBool callable_is_valid(void*) { return 1; }

// ---------------------------------------------------------------------------
// HavokPhysicsStats helper class (static telemetry methods callable from GDScript)
// ---------------------------------------------------------------------------
enum StatKind : intptr_t {
    STAT_LAST_STEP_US = 1,
    STAT_LAST_COLLIDE_US = 2,
    STAT_LAST_SOLVE_US = 3,
    STAT_WORKER_THREADS = 4,
    STAT_ACTIVE_BODIES = 5,
    STAT_TOTAL_BODIES = 6,
    STAT_HAVOK_MEM_BYTES = 7,
    STAT_STEP_COUNT = 8,
};

static int64_t read_stat(StatKind kind) {
    switch (kind) {
        case STAT_LAST_STEP_US: return g_telemetry.last_step_us.load(std::memory_order_relaxed);
        case STAT_LAST_COLLIDE_US: return g_telemetry.last_collide_us.load(std::memory_order_relaxed);
        case STAT_LAST_SOLVE_US: return g_telemetry.last_solve_us.load(std::memory_order_relaxed);
        case STAT_WORKER_THREADS: return g_telemetry.worker_threads.load(std::memory_order_relaxed);
        case STAT_ACTIVE_BODIES: return g_telemetry.active_bodies.load(std::memory_order_relaxed);
        case STAT_TOTAL_BODIES: return g_telemetry.total_bodies.load(std::memory_order_relaxed);
        case STAT_STEP_COUNT: return g_telemetry.step_count.load(std::memory_order_relaxed);
        case STAT_HAVOK_MEM_BYTES: {
            PROCESS_MEMORY_COUNTERS_EX pmc{};
            pmc.cb = sizeof(pmc);
            if (GetProcessMemoryInfo(GetCurrentProcess(), reinterpret_cast<PROCESS_MEMORY_COUNTERS*>(&pmc), sizeof(pmc))) {
                return static_cast<int64_t>(pmc.PrivateUsage);
            }
            return 0;
        }
        default: return 0;
    }
}

static void stats_method_call(
    void* method_userdata,
    GDExtensionClassInstancePtr,
    const GDExtensionConstVariantPtr*,
    GDExtensionInt,
    GDExtensionVariantPtr r_return,
    GDExtensionCallError* r_error) {
    int64_t val = read_stat(static_cast<StatKind>(reinterpret_cast<intptr_t>(method_userdata)));
    g_api.var_from_int(r_return, &val);
    if (r_error) r_error->error = GDEXTENSION_CALL_OK;
}

static void stats_method_ptrcall(
    void* method_userdata,
    GDExtensionClassInstancePtr,
    const GDExtensionConstTypePtr*,
    GDExtensionTypePtr r_ret) {
    *static_cast<int64_t*>(r_ret) = read_stat(static_cast<StatKind>(reinterpret_cast<intptr_t>(method_userdata)));
}

static void register_stat_method(const char* name, StatKind kind) {
    GdStringName mn = make_sn(name);
    GdStringName empty_sn = make_sn("");
    GdStringName int_cls = make_sn("");

    GDExtensionPropertyInfo ret_info{};
    ret_info.type = GDEXTENSION_VARIANT_TYPE_INT;
    ret_info.name = &empty_sn;
    ret_info.class_name = &int_cls;
    ret_info.hint = 0;
    ret_info.hint_string = &empty_sn;
    ret_info.usage = 0;

    GDExtensionClassMethodInfo mi{};
    mi.name = &mn;
    mi.method_userdata = reinterpret_cast<void*>(static_cast<intptr_t>(kind));
    mi.call_func = stats_method_call;
    mi.ptrcall_func = stats_method_ptrcall;
    mi.method_flags = GDEXTENSION_METHOD_FLAG_STATIC;
    mi.has_return_value = 1;
    mi.return_value_info = &ret_info;
    mi.return_value_metadata = GDEXTENSION_METHOD_ARGUMENT_METADATA_NONE;
    mi.argument_count = 0;

    g_api.classdb_register_method(g_api.library, &g_sn_havok_stats, &mi);
    free_sn(mn);
    free_sn(empty_sn);
    free_sn(int_cls);
}

static GDExtensionObjectPtr stats_create_instance(void*, GDExtensionBool) {
    return g_api.classdb_construct_object2(&g_sn_object);
}
static void stats_free_instance(void*, GDExtensionClassInstancePtr) {}

// ---------------------------------------------------------------------------
// Stage 1 Batch Bridge: Physics -> MultiMesh C++ Batch Sync (Havok & Jolt)
// ---------------------------------------------------------------------------
static GdPackedArray g_batch_mm_buf{};
static bool g_batch_mm_buf_inited = false;
static int64_t g_batch_mm_buf_len = 0;
static GDExtensionObjectPtr g_cached_rs = nullptr;
static GDExtensionMethodBindPtr g_mb_mm_set_buf = nullptr;
static GDExtensionObjectPtr g_cached_ps = nullptr;
static GDExtensionMethodBindPtr g_mb_body_get_state = nullptr;

static void ensure_batch_binds() {
    if (!g_batch_mm_buf_inited && g_api.packed_float32_ctor) {
        g_api.packed_float32_ctor(&g_batch_mm_buf, nullptr);
        g_batch_mm_buf_inited = true;
        g_batch_mm_buf_len = 0;
    }
    if (!g_cached_rs) {
        GdStringName rs_cls = make_sn("RenderingServer");
        GdStringName rs_fn = make_sn("multimesh_set_buffer");
        g_cached_rs = g_api.global_get_singleton(&rs_cls);
        g_mb_mm_set_buf = g_api.classdb_get_method_bind(&rs_cls, &rs_fn, 2960552364);
        free_sn(rs_cls);
        free_sn(rs_fn);
    }
    if (!g_cached_ps) {
        GdStringName ps_cls = make_sn("PhysicsServer3D");
        GdStringName ps_fn = make_sn("body_get_state");
        g_cached_ps = g_api.global_get_singleton(&ps_cls);
        g_mb_body_get_state = g_api.classdb_get_method_bind(&ps_cls, &ps_fn, 1850449534);
        free_sn(ps_cls);
        free_sn(ps_fn);
    }
}

static void shutdown_batch_buf() {
    if (g_batch_mm_buf_inited && g_api.packed_float32_destroy) {
        g_api.packed_float32_destroy(&g_batch_mm_buf);
        g_batch_mm_buf_inited = false;
        g_batch_mm_buf_len = 0;
    }
    g_cached_rs = nullptr;
    g_mb_mm_set_buf = nullptr;
    g_cached_ps = nullptr;
    g_mb_body_get_state = nullptr;
}

static int64_t sync_multimesh_from_bodies_impl(
    uint64_t mm_rid,
    const GdPackedArray* body_rids,
    const GdPackedArray* custom_r) {
    if (mm_rid == 0 || !body_rids) return 0;
    ensure_batch_binds();
    if (!g_batch_mm_buf_inited || !g_cached_rs || !g_mb_mm_set_buf) return 0;

    int64_t count = 0;
    g_api.packed_int64_size(const_cast<GdPackedArray*>(body_rids), nullptr, &count, 0);
    if (count <= 0) return 0;

    int64_t custom_count = 0;
    if (custom_r) {
        g_api.packed_float32_size(const_cast<GdPackedArray*>(custom_r), nullptr, &custom_count, 0);
    }
    const int64_t* rid_ptr = g_api.packed_int64_index_const(body_rids, 0);
    const float* custom_ptr = (custom_r && custom_count >= count)
        ? g_api.packed_float32_index_const(custom_r, 0)
        : nullptr;
    if (!rid_ptr) return 0;

    const int64_t needed_floats = count * 16;
    if (g_batch_mm_buf_len != needed_floats) {
        int64_t err = 0;
        const GDExtensionConstTypePtr rargs[1] = {&needed_floats};
        g_api.packed_float32_resize(&g_batch_mm_buf, rargs, &err, 1);
        g_batch_mm_buf_len = needed_floats;
    }

    float* dst = g_api.packed_float32_index(&g_batch_mm_buf, 0);
    if (!dst) return 0;

    int64_t written = 0;
    if (g_active_havok_server != nullptr) {
        // Fast path: direct Havok hknpWorld -> MultiMesh buffer (zero Variant/virtual overhead)
        written = g_active_havok_server->batch_fill_multimesh_buffer(rid_ptr, custom_ptr, count, dst);
    } else if (g_cached_ps && g_mb_body_get_state) {
        // Generic C++ batch path: accelerates Jolt Physics / GodotPhysics3D (eliminates GDScript loop)
        const int64_t state_xform = BODY_STATE_TRANSFORM;
        for (int64_t i = 0; i < count; ++i) {
            uint64_t rid = static_cast<uint64_t>(rid_ptr[i]);
            GdVariant ret_var{};
            g_api.variant_new_nil(&ret_var);
            const GDExtensionConstTypePtr call_args[2] = {&rid, &state_xform};
            g_api.object_method_bind_ptrcall(g_mb_body_get_state, g_cached_ps, call_args, &ret_var);
            GdTransform3D xf = variant_to_xform3d(&ret_var);
            g_api.variant_destroy(&ret_var);

            float* out = dst + i * 16;
            out[0]  = xf.basis.rows[0].x; out[1]  = xf.basis.rows[0].y; out[2]  = xf.basis.rows[0].z; out[3]  = xf.origin.x;
            out[4]  = xf.basis.rows[1].x; out[5]  = xf.basis.rows[1].y; out[6]  = xf.basis.rows[1].z; out[7]  = xf.origin.y;
            out[8]  = xf.basis.rows[2].x; out[9]  = xf.basis.rows[2].y; out[10] = xf.basis.rows[2].z; out[11] = xf.origin.z;
            out[12] = custom_ptr ? custom_ptr[i] : 0.0f;
            out[13] = 0.0f; out[14] = 0.0f; out[15] = 0.0f;
            ++written;
        }
    }

    const GDExtensionConstTypePtr set_args[2] = {&mm_rid, &g_batch_mm_buf};
    g_api.object_method_bind_ptrcall(g_mb_mm_set_buf, g_cached_rs, set_args, nullptr);
    return written;
}

static void batch_sync_call(
    void*,
    GDExtensionClassInstancePtr,
    const GDExtensionConstVariantPtr* p_args,
    GDExtensionInt p_arg_count,
    GDExtensionVariantPtr r_return,
    GDExtensionCallError* r_error) {
    if (p_arg_count < 3) {
        if (r_error) r_error->error = GDEXTENSION_CALL_ERROR_TOO_FEW_ARGUMENTS;
        return;
    }
    uint64_t mm_rid = 0;
    GdPackedArray body_rids{};
    GdPackedArray custom_r{};
    g_api.rid_from_var(&mm_rid, const_cast<void*>(p_args[0]));
    g_api.packed_int64_from_var(&body_rids, const_cast<void*>(p_args[1]));
    g_api.packed_float32_from_var(&custom_r, const_cast<void*>(p_args[2]));

    int64_t written = sync_multimesh_from_bodies_impl(mm_rid, &body_rids, &custom_r);
    g_api.packed_int64_destroy(&body_rids);
    g_api.packed_float32_destroy(&custom_r);

    g_api.var_from_int(r_return, &written);
    if (r_error) r_error->error = GDEXTENSION_CALL_OK;
}

static void batch_sync_ptrcall(
    void*,
    GDExtensionClassInstancePtr,
    const GDExtensionConstTypePtr* p_args,
    GDExtensionTypePtr r_ret) {
    uint64_t mm_rid = *static_cast<const uint64_t*>(p_args[0]);
    const auto* body_rids = static_cast<const GdPackedArray*>(p_args[1]);
    const auto* custom_r = static_cast<const GdPackedArray*>(p_args[2]);
    *static_cast<int64_t*>(r_ret) = sync_multimesh_from_bodies_impl(mm_rid, body_rids, custom_r);
}

static void register_batch_sync_method() {
    GdStringName mn = make_sn("sync_multimesh_from_bodies");
    GdStringName empty_sn = make_sn("");
    GdStringName arg0_sn = make_sn("multimesh_rid");
    GdStringName arg1_sn = make_sn("body_rids");
    GdStringName arg2_sn = make_sn("custom_data");

    GDExtensionPropertyInfo ret_info{};
    ret_info.type = GDEXTENSION_VARIANT_TYPE_INT;
    ret_info.name = &empty_sn;
    ret_info.class_name = &empty_sn;
    ret_info.hint_string = &empty_sn;

    GDExtensionPropertyInfo arg_info[3]{};
    arg_info[0].type = GDEXTENSION_VARIANT_TYPE_RID;
    arg_info[0].name = &arg0_sn;
    arg_info[0].class_name = &empty_sn;
    arg_info[0].hint_string = &empty_sn;

    arg_info[1].type = GDEXTENSION_VARIANT_TYPE_PACKED_INT64_ARRAY;
    arg_info[1].name = &arg1_sn;
    arg_info[1].class_name = &empty_sn;
    arg_info[1].hint_string = &empty_sn;

    arg_info[2].type = GDEXTENSION_VARIANT_TYPE_PACKED_FLOAT32_ARRAY;
    arg_info[2].name = &arg2_sn;
    arg_info[2].class_name = &empty_sn;
    arg_info[2].hint_string = &empty_sn;

    GDExtensionClassMethodArgumentMetadata arg_meta[3] = {
        GDEXTENSION_METHOD_ARGUMENT_METADATA_NONE,
        GDEXTENSION_METHOD_ARGUMENT_METADATA_NONE,
        GDEXTENSION_METHOD_ARGUMENT_METADATA_NONE,
    };

    GDExtensionClassMethodInfo mi{};
    mi.name = &mn;
    mi.call_func = batch_sync_call;
    mi.ptrcall_func = batch_sync_ptrcall;
    mi.method_flags = GDEXTENSION_METHOD_FLAG_STATIC;
    mi.has_return_value = 1;
    mi.return_value_info = &ret_info;
    mi.return_value_metadata = GDEXTENSION_METHOD_ARGUMENT_METADATA_NONE;
    mi.argument_count = 3;
    mi.arguments_info = arg_info;
    mi.arguments_metadata = arg_meta;

    g_api.classdb_register_method(g_api.library, &g_sn_havok_stats, &mi);

    free_sn(mn);
    free_sn(empty_sn);
    free_sn(arg0_sn);
    free_sn(arg1_sn);
    free_sn(arg2_sn);
}

// ---------------------------------------------------------------------------
// Extension Lifecycle
// ---------------------------------------------------------------------------
static void initialize_level(void*, GDExtensionInitializationLevel p_level) {
    if (p_level != GDEXTENSION_INITIALIZATION_SERVERS) {
        return;
    }

    init_virtual_table();

    g_sn_havok_server = make_sn("HavokPhysicsServer3D");
    g_sn_parent_server = make_sn("PhysicsServer3DExtension");
    g_sn_havok_stats = make_sn("HavokPhysicsStats");
    g_sn_object = make_sn("Object");

    // 1. Register HavokPhysicsServer3D
    GDExtensionClassCreationInfo4 cinfo{};
    cinfo.is_virtual = 0;
    cinfo.is_abstract = 0;
    cinfo.is_exposed = 1;
    cinfo.is_runtime = 0;
    cinfo.create_instance_func = server_create_instance;
    cinfo.free_instance_func = server_free_instance;
    cinfo.get_virtual_call_data_func = server_get_virtual_call_data;
    cinfo.call_virtual_with_data_func = server_call_virtual_with_data;

    g_api.classdb_register_class4(g_api.library, &g_sn_havok_server, &g_sn_parent_server, &cinfo);

    // 2. Register HavokPhysicsStats helper class
    GDExtensionClassCreationInfo4 sinfo{};
    sinfo.is_virtual = 0;
    sinfo.is_abstract = 0;
    sinfo.is_exposed = 1;
    sinfo.is_runtime = 0;
    sinfo.create_instance_func = stats_create_instance;
    sinfo.free_instance_func = stats_free_instance;
    g_api.classdb_register_class4(g_api.library, &g_sn_havok_stats, &g_sn_object, &sinfo);

    register_stat_method("get_last_step_us", STAT_LAST_STEP_US);
    register_stat_method("get_last_collide_us", STAT_LAST_COLLIDE_US);
    register_stat_method("get_last_solve_us", STAT_LAST_SOLVE_US);
    register_stat_method("get_worker_thread_count", STAT_WORKER_THREADS);
    register_stat_method("get_active_body_count", STAT_ACTIVE_BODIES);
    register_stat_method("get_total_body_count", STAT_TOTAL_BODIES);
    register_stat_method("get_havok_memory_bytes", STAT_HAVOK_MEM_BYTES);
    register_stat_method("get_step_count", STAT_STEP_COUNT);
    register_batch_sync_method();

    // 3. Register "HavokPhysics" in PhysicsServer3DManager
    GdStringName mgr_cls = make_sn("PhysicsServer3DManager");
    GdStringName reg_method = make_sn("register_server");
    GDExtensionObjectPtr mgr = g_api.global_get_singleton(&mgr_cls);
    GDExtensionMethodBindPtr mb = g_api.classdb_get_method_bind(&mgr_cls, &reg_method, 2137474292);
    if (mgr && mb) {
        GdString server_name = make_str("HavokPhysics");
        GdCallable cb{};
        GDExtensionCallableCustomInfo2 cb_info{};
        cb_info.token = g_api.library;
        cb_info.call_func = create_havok_server_callable;
        cb_info.is_valid_func = callable_is_valid;
        g_api.callable_custom_create2(&cb, &cb_info);

        GDExtensionConstTypePtr args[2] = {&server_name, &cb};
        g_api.object_method_bind_ptrcall(mb, mgr, args, nullptr);

        if (g_api.callable_destroy) g_api.callable_destroy(&cb);
        free_str(server_name);
    }
    free_sn(mgr_cls);
    free_sn(reg_method);
}

static void deinitialize_level(void*, GDExtensionInitializationLevel p_level) {
    if (p_level != GDEXTENSION_INITIALIZATION_SERVERS) {
        return;
    }
    shutdown_batch_buf();
    g_api.classdb_unregister_class(g_api.library, &g_sn_havok_stats);
    g_api.classdb_unregister_class(g_api.library, &g_sn_havok_server);
    free_sn(g_sn_havok_server);
    free_sn(g_sn_parent_server);
    free_sn(g_sn_havok_stats);
    free_sn(g_sn_object);
    clear_virtual_table();
    shutdown_havok();
}

} // namespace

extern "C" {

__declspec(dllexport) GDExtensionBool playforge_havok_physics_init(
    GDExtensionInterfaceGetProcAddress p_get_proc_address,
    GDExtensionClassLibraryPtr p_library,
    GDExtensionInitialization* r_initialization) {
    g_api.get_proc = p_get_proc_address;
    g_api.library = p_library;

    auto load = [&](const char* name) {
        return p_get_proc_address(name);
    };

    g_api.string_new = reinterpret_cast<GDExtensionInterfaceStringNewWithUtf8Chars>(load("string_new_with_utf8_chars"));
    g_api.string_name_new = reinterpret_cast<GDExtensionInterfaceStringNameNewWithUtf8Chars>(load("string_name_new_with_utf8_chars"));
    g_api.variant_get_ptr_constructor = reinterpret_cast<GDExtensionInterfaceVariantGetPtrConstructor>(load("variant_get_ptr_constructor"));
    g_api.variant_get_ptr_destructor = reinterpret_cast<GDExtensionInterfaceVariantGetPtrDestructor>(load("variant_get_ptr_destructor"));
    g_api.variant_get_ptr_builtin_method = reinterpret_cast<GDExtensionInterfaceVariantGetPtrBuiltinMethod>(load("variant_get_ptr_builtin_method"));
    g_api.string_destroy = g_api.variant_get_ptr_destructor(GDEXTENSION_VARIANT_TYPE_STRING);
    g_api.string_name_destroy = g_api.variant_get_ptr_destructor(GDEXTENSION_VARIANT_TYPE_STRING_NAME);
    g_api.callable_destroy = g_api.variant_get_ptr_destructor(GDEXTENSION_VARIANT_TYPE_CALLABLE);
    g_api.packed_float32_ctor = g_api.variant_get_ptr_constructor(GDEXTENSION_VARIANT_TYPE_PACKED_FLOAT32_ARRAY, 0);
    g_api.packed_float32_destroy = g_api.variant_get_ptr_destructor(GDEXTENSION_VARIANT_TYPE_PACKED_FLOAT32_ARRAY);
    g_api.packed_int64_destroy = g_api.variant_get_ptr_destructor(GDEXTENSION_VARIANT_TYPE_PACKED_INT64_ARRAY);
    {
        GdStringName sn_size = make_sn("size");
        GdStringName sn_resize = make_sn("resize");
        g_api.packed_float32_size = g_api.variant_get_ptr_builtin_method(GDEXTENSION_VARIANT_TYPE_PACKED_FLOAT32_ARRAY, &sn_size, 3173160232);
        g_api.packed_float32_resize = g_api.variant_get_ptr_builtin_method(GDEXTENSION_VARIANT_TYPE_PACKED_FLOAT32_ARRAY, &sn_resize, 848867239);
        g_api.packed_int64_size = g_api.variant_get_ptr_builtin_method(GDEXTENSION_VARIANT_TYPE_PACKED_INT64_ARRAY, &sn_size, 3173160232);
        free_sn(sn_size);
        free_sn(sn_resize);
    }
    g_api.packed_float32_index = reinterpret_cast<GDExtensionInterfacePackedFloat32ArrayOperatorIndex>(load("packed_float32_array_operator_index"));
    g_api.packed_float32_index_const = reinterpret_cast<GDExtensionInterfacePackedFloat32ArrayOperatorIndexConst>(load("packed_float32_array_operator_index_const"));
    g_api.packed_int64_index_const = reinterpret_cast<GDExtensionInterfacePackedInt64ArrayOperatorIndexConst>(load("packed_int64_array_operator_index_const"));

    g_api.variant_new_nil = reinterpret_cast<GDExtensionInterfaceVariantNewNil>(load("variant_new_nil"));
    g_api.variant_new_copy = reinterpret_cast<GDExtensionInterfaceVariantNewCopy>(load("variant_new_copy"));
    g_api.variant_destroy = reinterpret_cast<GDExtensionInterfaceVariantDestroy>(load("variant_destroy"));
    g_api.variant_get_type = reinterpret_cast<GDExtensionInterfaceVariantGetType>(load("variant_get_type"));
    g_api.get_var_from_type = reinterpret_cast<GDExtensionInterfaceGetVariantFromTypeConstructor>(load("get_variant_from_type_constructor"));
    g_api.get_var_to_type = reinterpret_cast<GDExtensionInterfaceGetVariantToTypeConstructor>(load("get_variant_to_type_constructor"));

    g_api.var_from_bool = g_api.get_var_from_type(GDEXTENSION_VARIANT_TYPE_BOOL);
    g_api.var_from_int = g_api.get_var_from_type(GDEXTENSION_VARIANT_TYPE_INT);
    g_api.var_from_float = g_api.get_var_from_type(GDEXTENSION_VARIANT_TYPE_FLOAT);
    g_api.var_from_vec3 = g_api.get_var_from_type(GDEXTENSION_VARIANT_TYPE_VECTOR3);
    g_api.var_from_xform3d = g_api.get_var_from_type(GDEXTENSION_VARIANT_TYPE_TRANSFORM3D);
    g_api.var_from_object = g_api.get_var_from_type(GDEXTENSION_VARIANT_TYPE_OBJECT);
    g_api.var_from_plane = g_api.get_var_from_type(GDEXTENSION_VARIANT_TYPE_PLANE);

    g_api.bool_from_var = g_api.get_var_to_type(GDEXTENSION_VARIANT_TYPE_BOOL);
    g_api.int_from_var = g_api.get_var_to_type(GDEXTENSION_VARIANT_TYPE_INT);
    g_api.float_from_var = g_api.get_var_to_type(GDEXTENSION_VARIANT_TYPE_FLOAT);
    g_api.vec3_from_var = g_api.get_var_to_type(GDEXTENSION_VARIANT_TYPE_VECTOR3);
    g_api.xform3d_from_var = g_api.get_var_to_type(GDEXTENSION_VARIANT_TYPE_TRANSFORM3D);
    g_api.plane_from_var = g_api.get_var_to_type(GDEXTENSION_VARIANT_TYPE_PLANE);
    g_api.rid_from_var = g_api.get_var_to_type(GDEXTENSION_VARIANT_TYPE_RID);
    g_api.packed_int64_from_var = g_api.get_var_to_type(GDEXTENSION_VARIANT_TYPE_PACKED_INT64_ARRAY);
    g_api.packed_float32_from_var = g_api.get_var_to_type(GDEXTENSION_VARIANT_TYPE_PACKED_FLOAT32_ARRAY);

    g_api.global_get_singleton = reinterpret_cast<GDExtensionInterfaceGlobalGetSingleton>(load("global_get_singleton"));
    g_api.classdb_construct_object2 = reinterpret_cast<GDExtensionInterfaceClassdbConstructObject2>(load("classdb_construct_object2"));
    g_api.classdb_get_method_bind = reinterpret_cast<GDExtensionInterfaceClassdbGetMethodBind>(load("classdb_get_method_bind"));
    g_api.classdb_register_class4 = reinterpret_cast<GDExtensionInterfaceClassdbRegisterExtensionClass4>(load("classdb_register_extension_class4"));
    g_api.classdb_register_method = reinterpret_cast<GDExtensionInterfaceClassdbRegisterExtensionClassMethod>(load("classdb_register_extension_class_method"));
    g_api.classdb_unregister_class = reinterpret_cast<GDExtensionInterfaceClassdbUnregisterExtensionClass>(load("classdb_unregister_extension_class"));
    g_api.object_method_bind_ptrcall = reinterpret_cast<GDExtensionInterfaceObjectMethodBindPtrcall>(load("object_method_bind_ptrcall"));
    g_api.object_set_instance = reinterpret_cast<GDExtensionInterfaceObjectSetInstance>(load("object_set_instance"));
    g_api.object_set_instance_binding = reinterpret_cast<GDExtensionInterfaceObjectSetInstanceBinding>(load("object_set_instance_binding"));
    g_api.callable_custom_create2 = reinterpret_cast<GDExtensionInterfaceCallableCustomCreate2>(load("callable_custom_create2"));
    g_api.print_warning = reinterpret_cast<GDExtensionInterfacePrintWarning>(load("print_warning"));

    r_initialization->minimum_initialization_level = GDEXTENSION_INITIALIZATION_SERVERS;
    r_initialization->userdata = nullptr;
    r_initialization->initialize = initialize_level;
    r_initialization->deinitialize = deinitialize_level;
    return 1;
}

} // extern "C"
