#import "PlayHubGodotBridge.h"

@interface PlayHubGodotBridgeFacade ()
@property(nonatomic, assign) BOOL engineHookInstalled;
@end

@implementation PlayHubGodotBridgeFacade

+ (instancetype)shared {
    static PlayHubGodotBridgeFacade *instance = nil;
    static dispatch_once_t onceToken;
    dispatch_once(&onceToken, ^{
        instance = [[PlayHubGodotBridgeFacade alloc] init];
    });
    return instance;
}

- (void)installEngineHookIfNeeded {
    if (self.engineHookInstalled) {
        return;
    }
    self.engineHookInstalled = YES;
    // Note: During M0 macOS linkage against libgodot.ios.release.xcframework,
    // add_apple_embedded_platform_init_callback() registers the C++ Object subclass
    // under Engine::get_singleton()->add_singleton(Engine::Singleton("PlayHubBridge", ...))
    // forwarding GDScript calls to self.onMethodCall and signals via call_deferred().
}

- (void)emitResponseForRequestId:(NSString *)reqId ok:(BOOL)ok payloadJson:(NSString *)payloadJson {
    [[NSNotificationCenter defaultCenter]
        postNotificationName:@"PlayHubGodotBridgeResponse"
                      object:self
                    userInfo:@{
                        @"reqId": reqId ?: @"",
                        @"ok": @(ok),
                        @"payloadJson": payloadJson ?: @"{}"
                    }];
}

- (void)emitEventType:(NSString *)eventType payloadJson:(NSString *)payloadJson {
    [[NSNotificationCenter defaultCenter]
        postNotificationName:@"PlayHubGodotBridgeEvent"
                      object:self
                    userInfo:@{
                        @"eventType": eventType ?: @"",
                        @"payloadJson": payloadJson ?: @"{}"
                    }];
}

- (void)requestCleanReset {
    [self emitEventType:@"host_clean_reset" payloadJson:@"{}"];
}

- (void)requestMountPckAtPath:(NSString *)pckPath {
    self.launchPckPath = pckPath;
    NSDictionary *payload = @{ @"pckPath": pckPath ?: @"" };
    NSData *data = [NSJSONSerialization dataWithJSONObject:payload options:0 error:nil];
    NSString *json = data ? [[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding] : @"{}";
    [self emitEventType:@"host_mount_pck" payloadJson:json ?: @"{}"];
}

@end
