cmake_minimum_required(VERSION 3.20)
project(GamePlayForgeRuntime LANGUAGES C CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

set(LUA_DIR "${CMAKE_CURRENT_SOURCE_DIR}/vendor/lua-5.4.9/src")
set(LUA_SOURCES
    ${LUA_DIR}/lapi.c ${LUA_DIR}/lauxlib.c ${LUA_DIR}/lbaselib.c
    ${LUA_DIR}/lcode.c ${LUA_DIR}/lcorolib.c ${LUA_DIR}/lctype.c
    ${LUA_DIR}/ldebug.c ${LUA_DIR}/ldo.c ${LUA_DIR}/ldump.c
    ${LUA_DIR}/lfunc.c ${LUA_DIR}/lgc.c ${LUA_DIR}/llex.c
    ${LUA_DIR}/lmem.c ${LUA_DIR}/lobject.c ${LUA_DIR}/lopcodes.c
    ${LUA_DIR}/lparser.c ${LUA_DIR}/lstate.c ${LUA_DIR}/lstring.c
    ${LUA_DIR}/lstrlib.c ${LUA_DIR}/ltable.c ${LUA_DIR}/ltablib.c
    ${LUA_DIR}/ltm.c ${LUA_DIR}/lundump.c ${LUA_DIR}/lutf8lib.c
    ${LUA_DIR}/lvm.c ${LUA_DIR}/lzio.c ${LUA_DIR}/lmathlib.c
)
add_library(lua54 STATIC ${LUA_SOURCES})
target_include_directories(lua54 PUBLIC ${LUA_DIR})

add_executable(GamePlayForgeRuntime src/main.cpp)
target_include_directories(GamePlayForgeRuntime PRIVATE
    "${CMAKE_CURRENT_SOURCE_DIR}/vendor/nlohmann")
target_link_libraries(GamePlayForgeRuntime PRIVATE lua54)
if(MSVC)
    target_compile_options(GamePlayForgeRuntime PRIVATE /W4 /permissive- /EHsc)
    target_compile_options(lua54 PRIVATE /W3 /wd4244 /wd4267)
endif()

set_target_properties(GamePlayForgeRuntime PROPERTIES
    RUNTIME_OUTPUT_DIRECTORY "${CMAKE_CURRENT_SOURCE_DIR}/build/Release"
    RUNTIME_OUTPUT_DIRECTORY_RELEASE "${CMAKE_CURRENT_SOURCE_DIR}/build/Release"
    RUNTIME_OUTPUT_DIRECTORY_DEBUG "${CMAKE_CURRENT_SOURCE_DIR}/build/Debug"
    RUNTIME_OUTPUT_DIRECTORY_RELWITHDEBINFO "${CMAKE_CURRENT_SOURCE_DIR}/build/RelWithDebInfo"
    RUNTIME_OUTPUT_DIRECTORY_MINSIZEREL "${CMAKE_CURRENT_SOURCE_DIR}/build/MinSizeRel"
)
