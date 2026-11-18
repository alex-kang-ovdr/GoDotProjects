// Godot 4.7 Windows x86-64, with sizes checked against the editor at build time.
#include "gdextension_interface.h"

typedef struct { uint64_t storage[3]; } Variant;
typedef struct { uint64_t storage; } StringName;
enum { HISTORY_TURNS = 12 };

// Each slot owns a deep copy of one completed user/assistant exchange.
typedef struct {
    unsigned first, count;
    Variant turns[HISTORY_TURNS];
} ChatHistory;

static GDExtensionClassLibraryPtr library;
static StringName dock_name, parent_name, history_key, exchange_key, append_array;
static GDExtensionMethodBindPtr notification;
static GDExtensionPtrOperatorEvaluator names_equal;
static GDExtensionPtrDestructor destroy_name;

#define INTERFACES(X) \
    X(ClassdbConstructObject3, construct_object, "classdb_construct_object3") \
    X(ClassdbRegisterExtensionClass6, register_class, "classdb_register_extension_class6") \
    X(ClassdbUnregisterExtensionClass, unregister_class, "classdb_unregister_extension_class") \
    X(ClassdbGetMethodBind, get_method, "classdb_get_method_bind") \
    X(ObjectMethodBindPtrcall, call_method, "object_method_bind_ptrcall") \
    X(ObjectSetInstance, set_instance, "object_set_instance") \
    X(MemAlloc2, allocate, "mem_alloc2") \
    X(MemFree2, release, "mem_free2") \
    X(StringNameNewWithLatin1Chars, make_name, "string_name_new_with_latin1_chars") \
    X(VariantConstruct, construct_variant, "variant_construct") \
    X(VariantDuplicate, duplicate_variant, "variant_duplicate") \
    X(VariantDestroy, destroy_variant, "variant_destroy") \
    X(VariantGetType, variant_type, "variant_get_type") \
    X(VariantGetPtrDestructor, get_destructor, "variant_get_ptr_destructor") \
    X(VariantGetPtrOperatorEvaluator, get_operator, "variant_get_ptr_operator_evaluator") \
    X(VariantCall, call_variant, "variant_call")

#define DECLARE(type, name, symbol) static GDExtensionInterface##type name;
INTERFACES(DECLARE)

static GDExtensionBool matches(GDExtensionConstStringNamePtr name, const StringName *key) {
    GDExtensionBool result;
    names_equal(name, key, &result);
    return result;
}

static GDExtensionObjectPtr create_dock(void *unused, GDExtensionBool notify) {
    ChatHistory *history = allocate(sizeof(ChatHistory), 0);
    if (!history) return NULL;
    history->first = history->count = 0;
    GDExtensionObjectPtr node = construct_object(&parent_name);
    set_instance(node, &dock_name, history);
    if (notify) {
        int64_t postinitialize = 0;
        GDExtensionBool reversed = 0;
        GDExtensionConstTypePtr args[] = { &postinitialize, &reversed };
        call_method(notification, node, args, NULL);
    }
    return node;
}

static void destroy_dock(void *unused, GDExtensionClassInstancePtr instance) {
    ChatHistory *history = instance;
    for (unsigned i = 0; i < history->count; ++i) {
        destroy_variant(&history->turns[(history->first + i) % HISTORY_TURNS]);
    }
    release(history, 0);
}

// These private, non-serialized properties are shared only with the attached UI script.
static GDExtensionBool store_exchange(GDExtensionClassInstancePtr instance,
        GDExtensionConstStringNamePtr name, GDExtensionConstVariantPtr value) {
    if (!matches(name, &exchange_key) || variant_type(value) != GDEXTENSION_VARIANT_TYPE_ARRAY) return 0;
    ChatHistory *history = instance;
    unsigned next = (history->first + history->count) % HISTORY_TURNS;
    if (history->count == HISTORY_TURNS) {
        destroy_variant(&history->turns[next]);
        history->first = (history->first + 1) % HISTORY_TURNS;
    } else {
        ++history->count;
    }
    duplicate_variant(value, &history->turns[next], 1);
    return 1;
}

static GDExtensionBool read_history(GDExtensionClassInstancePtr instance,
        GDExtensionConstStringNamePtr name, GDExtensionVariantPtr result) {
    if (!matches(name, &history_key)) return 0;
    ChatHistory *history = instance;
    Variant messages;
    GDExtensionCallError error;
    construct_variant(GDEXTENSION_VARIANT_TYPE_ARRAY, &messages, NULL, 0, &error);
    for (unsigned i = 0; i < history->count; ++i) {
        Variant ignored;
        GDExtensionConstVariantPtr turn = &history->turns[(history->first + i) % HISTORY_TURNS];
        call_variant(&messages, &append_array, &turn, 1, &ignored, &error);
        destroy_variant(&ignored);
    }
    destroy_variant(result);
    duplicate_variant(&messages, result, 1);
    destroy_variant(&messages);
    return 1;
}

static void initialize(void *unused, GDExtensionInitializationLevel level) {
    if (level != GDEXTENSION_INITIALIZATION_SCENE) return;
    destroy_name = get_destructor(GDEXTENSION_VARIANT_TYPE_STRING_NAME);
    names_equal = get_operator(GDEXTENSION_VARIANT_OP_EQUAL, GDEXTENSION_VARIANT_TYPE_STRING_NAME,
                               GDEXTENSION_VARIANT_TYPE_STRING_NAME);
    make_name(&dock_name, "PlayForgeAgentChatDock", 0);
    make_name(&parent_name, "VBoxContainer", 0);
    make_name(&history_key, "agent_chat_history", 0);
    make_name(&exchange_key, "agent_chat_exchange", 0);
    make_name(&append_array, "append_array", 0);
    StringName object_name, method_name;
    make_name(&object_name, "Object", 0);
    make_name(&method_name, "notification", 0);
    notification = get_method(&object_name, &method_name, 4023243586LL);
    destroy_name(&method_name);
    destroy_name(&object_name);
    static const GDExtensionClassCreationInfo6 info = {
        .is_exposed = 1,
        .create_instance_func = create_dock,
        .free_instance_func = destroy_dock,
        .set_func = store_exchange,
        .get_func = read_history,
    };
    register_class(library, &dock_name, &parent_name, &info);
}

static void deinitialize(void *unused, GDExtensionInitializationLevel level) {
    if (level != GDEXTENSION_INITIALIZATION_SCENE) return;
    unregister_class(library, &dock_name);
    destroy_name(&append_array);
    destroy_name(&exchange_key);
    destroy_name(&history_key);
    destroy_name(&parent_name);
    destroy_name(&dock_name);
}

__declspec(dllexport) GDExtensionBool playforge_agent_chat_init(
        GDExtensionInterfaceGetProcAddress resolve, GDExtensionClassLibraryPtr handle,
        GDExtensionInitialization *init) {
    library = handle;
#define LOAD(type, name, symbol) \
    name = (GDExtensionInterface##type)resolve(symbol); \
    if (!name) return 0;
    INTERFACES(LOAD)
    init->minimum_initialization_level = GDEXTENSION_INITIALIZATION_SCENE;
    init->userdata = NULL;
    init->initialize = initialize;
    init->deinitialize = deinitialize;
    return 1;
}
