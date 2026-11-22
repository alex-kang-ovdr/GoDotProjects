#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

typedef void (^PlayHubBridgeCallHandler)(NSString *method, NSString *reqId, NSString *payloadJson);

/// Objective-C++ facade bridging Godot 4.7.2 single-process runtime ("PlayHubBridge" singleton)
/// and Swift PlayHubRuntimeBroker without exposing Keychain tokens or raw StoreKit receipts.
@interface PlayHubGodotBridgeFacade : NSObject

+ (instancetype)shared;

@property(nonatomic, copy, nullable) NSString *launchPckPath;
@property(nonatomic, copy, nullable) NSString *userDataPrefix;
@property(nonatomic, copy, nullable) PlayHubBridgeCallHandler onMethodCall;
@property(nonatomic, copy, nullable) dispatch_block_t onCleanResetCompleted;

/// Registers the bridge callback with Godot's apple_embedded platform initializer.
- (void)installEngineHookIfNeeded;

/// Emits an asynchronous response back into GDScript (bridge_response signal).
- (void)emitResponseForRequestId:(NSString *)reqId ok:(BOOL)ok payloadJson:(NSString *)payloadJson;

/// Emits a host lifecycle/IAP/social/reset event into GDScript (bridge_event signal).
- (void)emitEventType:(NSString *)eventType payloadJson:(NSString *)payloadJson;

/// Requests Godot's bootstrap.gd to run the 7-step Clean Reset back to idle_standby.tscn.
- (void)requestCleanReset;

/// Requests Godot's warm runtime to mount a newly verified On-Demand .pck.
- (void)requestMountPckAtPath:(NSString *)pckPath;

@end

NS_ASSUME_NONNULL_END
