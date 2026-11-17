#include <algorithm>
#include <cmath>
#include <cstddef>
#include <cstdlib>
#include <iostream>
#include <limits>
#include <memory>
#include <optional>
#include <string>
#include <string_view>
#include <unordered_set>

extern "C" {
#include "lua.h"
#include "lauxlib.h"
#include "lualib.h"
}

#include <json.hpp>

namespace {
using Json = nlohmann::json;
constexpr std::size_t kLuaMemoryLimit = 16U * 1024U * 1024U;
constexpr int kInstructionLimit = 1'000'000;
constexpr int kInstructionHookGranularity = 10'000;
constexpr std::size_t kMaxInputLine = 32U * 1024U * 1024U;
constexpr int kMaxJsonDepth = 64;
constexpr std::size_t kMaxJsonNodes = 100'000;
constexpr std::string_view kRuntimeName = "GamePlayForge C++20 / Lua 5.4.9";

struct LuaContext {
    std::size_t allocated = 0;
    int instructions = 0;
    int gameRef = LUA_NOREF;
};

void* limitedAllocator(void* userData, void* pointer, std::size_t oldSize, std::size_t newSize) {
    auto& context = *static_cast<LuaContext*>(userData);
    if (newSize == 0) {
        if (pointer != nullptr) {
            context.allocated = oldSize > context.allocated ? 0 : context.allocated - oldSize;
            std::free(pointer);
        }
        return nullptr;
    }

    const std::size_t effectiveOldSize = pointer == nullptr ? 0 : oldSize;
    if (newSize > effectiveOldSize && newSize - effectiveOldSize > kLuaMemoryLimit - context.allocated) {
        return nullptr;
    }
    void* replacement = std::realloc(pointer, newSize);
    if (replacement != nullptr) {
        context.allocated = context.allocated - std::min(context.allocated, effectiveOldSize) + newSize;
    }
    return replacement;
}

void instructionHook(lua_State* state, lua_Debug*) {
    auto* context = *static_cast<LuaContext**>(lua_getextraspace(state));
    context->instructions += kInstructionHookGranularity;
    if (context->instructions > kInstructionLimit) {
        luaL_error(state, "script instruction limit exceeded");
    }
}

void openSafeLibraries(lua_State* state) {
    luaL_requiref(state, "_G", luaopen_base, 1);
    lua_pop(state, 1);
    luaL_requiref(state, "math", luaopen_math, 1);
    lua_pop(state, 1);
    luaL_requiref(state, "table", luaopen_table, 1);
    lua_pop(state, 1);
    luaL_requiref(state, "string", luaopen_string, 1);
    lua_pop(state, 1);
    luaL_requiref(state, "utf8", luaopen_utf8, 1);
    lua_pop(state, 1);

    lua_getglobal(state, "_G");
    for (const char* name : {"dofile", "loadfile", "load", "print", "warn", "collectgarbage"}) {
        lua_pushnil(state);
        lua_setfield(state, -2, name);
    }
    lua_pop(state, 1);

    lua_getglobal(state, "string");
    lua_pushnil(state);
    lua_setfield(state, -2, "dump");
    lua_pop(state, 1);

}

void pushJson(lua_State* state, const Json& value, int depth = 0) {
    if (depth > kMaxJsonDepth) {
        throw std::runtime_error("settings exceed maximum JSON depth");
    }
    if (lua_checkstack(state, 4) == 0) {
        throw std::runtime_error("Lua stack capacity exceeded while converting settings");
    }
    if (value.is_null()) {
        lua_pushnil(state);
    } else if (value.is_boolean()) {
        lua_pushboolean(state, value.get<bool>());
    } else if (value.is_number()) {
        lua_pushnumber(state, value.get<double>());
    } else if (value.is_string()) {
        const auto& string = value.get_ref<const Json::string_t&>();
        lua_pushlstring(state, string.data(), string.size());
    } else if (value.is_array()) {
        if (value.size() > static_cast<std::size_t>(std::numeric_limits<int>::max())) {
            throw std::runtime_error("settings array is too large");
        }
        lua_createtable(state, static_cast<int>(value.size()), 0);
        int index = 1;
        for (const auto& item : value) {
            pushJson(state, item, depth + 1);
            lua_rawseti(state, -2, index++);
        }
    } else if (value.is_object()) {
        if (value.size() > static_cast<std::size_t>(std::numeric_limits<int>::max())) {
            throw std::runtime_error("settings object is too large");
        }
        lua_createtable(state, 0, static_cast<int>(value.size()));
        for (auto iterator = value.begin(); iterator != value.end(); ++iterator) {
            lua_pushlstring(state, iterator.key().data(), iterator.key().size());
            pushJson(state, iterator.value(), depth + 1);
            lua_rawset(state, -3);
        }
    } else {
        throw std::runtime_error("unsupported JSON value");
    }
}

std::string luaError(lua_State* state) {
    std::size_t size = 0;
    const char* message = lua_tolstring(state, -1, &size);
    return message == nullptr ? "Lua runtime error" : std::string(message, size);
}

bool isArrayField(std::string_view field) {
    return field == "pipes" || field == "events";
}

struct JsonBuildContext {
    std::unordered_set<const void*> activeTables;
    std::size_t nodes = 0;
};

Json readLuaValue(lua_State* state, int index, std::string_view field,
                  JsonBuildContext& context, int depth) {
    if (depth > kMaxJsonDepth || ++context.nodes > kMaxJsonNodes) {
        throw std::runtime_error("snapshot exceeds JSON serialization limits");
    }
    if (lua_checkstack(state, 4) == 0) {
        throw std::runtime_error("Lua stack capacity exceeded while reading snapshot");
    }
    index = lua_absindex(state, index);
    switch (lua_type(state, index)) {
    case LUA_TNIL:
        return nullptr;
    case LUA_TBOOLEAN:
        return lua_toboolean(state, index) != 0;
    case LUA_TNUMBER: {
        const double value = lua_tonumber(state, index);
        return std::isfinite(value) ? Json(value) : Json(nullptr);
    }
    case LUA_TSTRING: {
        std::size_t size = 0;
        const char* value = lua_tolstring(state, index, &size);
        return std::string(value, size);
    }
    case LUA_TTABLE: {
        const void* identity = lua_topointer(state, index);
        if (!context.activeTables.insert(identity).second) {
            throw std::runtime_error("snapshot contains a cyclic table");
        }
        std::size_t count = 0;
        bool onlyPositiveIntegerKeys = true;
        std::size_t largestIndex = 0;
        bool onlyStringKeys = true;
        lua_pushnil(state);
        while (lua_next(state, index) != 0) {
            ++count;
            if (lua_type(state, -2) == LUA_TNUMBER && lua_isinteger(state, -2)) {
                const lua_Integer key = lua_tointeger(state, -2);
                if (key < 1) {
                    onlyPositiveIntegerKeys = false;
                } else {
                    largestIndex = std::max(largestIndex, static_cast<std::size_t>(key));
                }
                onlyStringKeys = false;
            } else if (lua_type(state, -2) == LUA_TSTRING) {
                onlyPositiveIntegerKeys = false;
            } else {
                onlyPositiveIntegerKeys = false;
                onlyStringKeys = false;
            }
            lua_pop(state, 1);
        }

        Json result;
        if (count == 0) {
            result = isArrayField(field) ? Json::array() : Json::object();
        } else if (onlyPositiveIntegerKeys && largestIndex == count) {
            result = Json::array();
            result.get_ref<Json::array_t&>().reserve(count);
            for (std::size_t i = 1; i <= count; ++i) {
                lua_rawgeti(state, index, static_cast<lua_Integer>(i));
                result.push_back(readLuaValue(state, -1, {}, context, depth + 1));
                lua_pop(state, 1);
            }
        } else if (onlyStringKeys) {
            result = Json::object();
            lua_pushnil(state);
            while (lua_next(state, index) != 0) {
                std::size_t keySize = 0;
                const char* key = lua_tolstring(state, -2, &keySize);
                if (key == nullptr) {
                    lua_pop(state, 2);
                    throw std::runtime_error("snapshot object has a non-string key");
                }
                const std::string keyString(key, keySize);
                result[keyString] = readLuaValue(state, -1, keyString, context, depth + 1);
                lua_pop(state, 1);
            }
        } else {
            lua_pop(state, 0);
            context.activeTables.erase(identity);
            throw std::runtime_error("snapshot table must use only string keys or a dense 1-based array");
        }
        context.activeTables.erase(identity);
        return result;
    }
    default:
        throw std::runtime_error("snapshot contains a value that cannot be represented in JSON");
    }
}

class LuaGame {
public:
    LuaGame() = default;
    ~LuaGame() { unload(); }

    void unload() {
        if (state_ != nullptr) {
            lua_close(state_);
            state_ = nullptr;
        }
        context_ = LuaContext{};
    }

    Json handle(const Json& command) {
        if (!command.is_object() || !command.contains("op") || !command["op"].is_string()) {
            throw std::runtime_error("command must be an object with a string op");
        }
        const std::string op = command["op"].get<std::string>();
        if (op == "load") {
            load(command);
        } else if (op == "step") {
            requireLoaded();
            if (!command.contains("dt") || !command["dt"].is_number()) {
                throw std::runtime_error("step requires numeric dt");
            }
            const double dt = command["dt"].get<double>();
            if (!std::isfinite(dt) || dt < 0.0 || dt > 1.0) {
                throw std::runtime_error("dt must be finite and between 0 and 1");
            }
            callMethod("Update", [&] { lua_pushnumber(state_, dt); });
        } else if (op == "input") {
            requireLoaded();
            if (!command.contains("action") || !command["action"].is_string()) {
                throw std::runtime_error("input requires a string action");
            }
            const std::string action = command["action"].get<std::string>();
            if (action.empty() || action.size() > 128) throw std::runtime_error("input action must contain 1 to 128 bytes");
            callMethod("Input", [&] { lua_pushlstring(state_, action.data(), action.size()); });
        } else if (op == "settings") {
            requireLoaded();
            if (!command.contains("settings") || !command["settings"].is_object()) {
                throw std::runtime_error("settings requires a settings object");
            }
            reset(command["settings"]);
        } else if (op == "snapshot") {
            requireLoaded();
        } else if (op == "stop") {
            unload();
            return Json{{"ok", true}, {"runtime", kRuntimeName}, {"state", nullptr}};
        } else {
            throw std::runtime_error("unsupported op: " + op);
        }

        Json state = snapshot();
        return Json{{"ok", true}, {"runtime", kRuntimeName}, {"state", std::move(state)}};
    }

private:
    void requireLoaded() const {
        if (state_ == nullptr || context_.gameRef == LUA_NOREF) {
            throw std::runtime_error("no Lua game is loaded");
        }
    }

    void reset(const Json& settings) {
        callMethod("Reset", [&] { pushJson(state_, settings); });
    }

    template<typename PushArgument>
    void callMethod(const char* name, PushArgument pushArgument) {
        context_.instructions = 0;
        lua_sethook(state_, instructionHook, LUA_MASKCOUNT, kInstructionHookGranularity);
        lua_rawgeti(state_, LUA_REGISTRYINDEX, context_.gameRef);
        lua_pushstring(state_, name);
        lua_rawget(state_, -2);
        if (!lua_isfunction(state_, -1)) {
            lua_settop(state_, 0);
            throw std::runtime_error(std::string("Game:") + name + " is not defined");
        }
        lua_pushvalue(state_, -2);
        try {
            pushArgument();
        } catch (...) {
            lua_settop(state_, 0);
            throw;
        }
        if (lua_pcall(state_, 2, 0, 0) != LUA_OK) {
            const std::string error = luaError(state_);
            lua_settop(state_, 0);
            throw std::runtime_error(error);
        }
        lua_settop(state_, 0);
    }

    void load(const Json& command) {
        if (!command.contains("source") || !command["source"].is_string()) {
            throw std::runtime_error("load requires a Lua source string");
        }
        const std::string source = command["source"].get<std::string>();
        const Json settings = command.value("settings", Json::object());
        if (!settings.is_object()) {
            throw std::runtime_error("load settings must be an object");
        }

        unload();
        state_ = lua_newstate(limitedAllocator, &context_);
        if (state_ == nullptr) {
            throw std::runtime_error("could not create Lua state within memory limit");
        }
        *static_cast<LuaContext**>(lua_getextraspace(state_)) = &context_;
        openSafeLibraries(state_);
        context_.instructions = 0;
        lua_sethook(state_, instructionHook, LUA_MASKCOUNT, kInstructionHookGranularity);
        if (luaL_loadbufferx(state_, source.data(), source.size(), "Game.lua", "t") != LUA_OK) {
            const std::string error = luaError(state_);
            unload();
            throw std::runtime_error(error);
        }
        if (lua_pcall(state_, 0, 1, 0) != LUA_OK) {
            const std::string error = luaError(state_);
            unload();
            throw std::runtime_error(error);
        }
        if (!lua_istable(state_, -1)) {
            unload();
            throw std::runtime_error("Lua source must return a Game table");
        }
        context_.gameRef = luaL_ref(state_, LUA_REGISTRYINDEX);
        reset(settings);
    }

    Json snapshot() {
        requireLoaded();
        context_.instructions = 0;
        lua_sethook(state_, instructionHook, LUA_MASKCOUNT, kInstructionHookGranularity);
        lua_rawgeti(state_, LUA_REGISTRYINDEX, context_.gameRef);
        lua_pushliteral(state_, "Snapshot");
        lua_rawget(state_, -2);
        if (!lua_isfunction(state_, -1)) {
            lua_settop(state_, 0);
            throw std::runtime_error("Game:Snapshot is not defined");
        }
        lua_pushvalue(state_, -2);
        if (lua_pcall(state_, 1, 1, 0) != LUA_OK) {
            const std::string error = luaError(state_);
            lua_settop(state_, 0);
            throw std::runtime_error(error);
        }
        try {
            JsonBuildContext context;
            Json result = readLuaValue(state_, -1, {}, context, 0);
            if (!result.is_object()) {
                throw std::runtime_error("Game:Snapshot must return a table with string keys");
            }
            lua_settop(state_, 0);
            return result;
        } catch (...) {
            lua_settop(state_, 0);
            throw;
        }
    }

    LuaContext context_;
    lua_State* state_ = nullptr;
};

Json errorResponse(std::string message) {
    return Json{{"ok", false}, {"error", std::move(message)}};
}
} // namespace

int main() {
    LuaGame game;
    std::string line;
    while (std::getline(std::cin, line)) {
        if (line.size() > kMaxInputLine) {
            std::cout << errorResponse("input line exceeds 32 MiB limit").dump() << '\n' << std::flush;
            continue;
        }
        try {
            const Json command = Json::parse(line);
            std::cout << game.handle(command).dump() << '\n' << std::flush;
        } catch (const std::exception& error) {
            std::cout << errorResponse(error.what()).dump() << '\n' << std::flush;
        } catch (...) {
            std::cout << errorResponse("unknown runtime failure").dump() << '\n' << std::flush;
        }
    }
    return 0;
}
