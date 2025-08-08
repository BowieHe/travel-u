import { useRef, useEffect } from 'react';

function loadAmapScript(key: string, securityCode?: string): Promise<void> {
    return new Promise((resolve, reject) => {
        if ((window as any).AMap) {
            resolve();
            return;
        }
        // 安全码配置
        if (securityCode) {
            (window as any)._AMapSecurityConfig = { securityJsCode: securityCode };
        }
        const script = document.createElement('script');
        script.src = `https://webapi.amap.com/maps?v=2.0&key=${key}&plugin=AMap.Scale,AMap.ToolBar`;
        script.async = true;
        script.onload = () => resolve();
        script.onerror = (e) => reject(e);
        document.head.appendChild(script);
    });
}

const AMapComponent: React.FC = () => {
    const mapRef = useRef<HTMLDivElement>(null);
    const mapInstance = useRef<any>(null);

    useEffect(() => {
        const initMap = () => {
            if (!mapRef.current) return;

            // 检查 AMap 是否已加载
            if (!(window as any).AMap) {
                console.error('AMap is not loaded');
                return;
            }

            try {
                // 初始化高德地图
                mapInstance.current = new (window as any).AMap.Map(mapRef.current, {
                    zoom: 4,
                    center: [116.397428, 39.90923], // 北京坐标
                    viewMode: '2D', // 先使用 2D 模式，避免 WebGL 相关错误
                    features: ['bg', 'road', 'building', 'point'],
                });

                // 等待地图完全加载后再添加控件
                mapInstance.current.on('complete', () => {
                    try {
                        // 添加工具条
                        if ((window as any).AMap.ToolBar) {
                            mapInstance.current.addControl(
                                new (window as any).AMap.ToolBar({
                                    position: {
                                        top: '10px',
                                        right: '10px',
                                    },
                                })
                            );
                        }

                        if ((window as any).AMap.Scale) {
                            mapInstance.current.addControl(
                                new (window as any).AMap.Scale({
                                    position: {
                                        bottom: '10px',
                                        left: '10px',
                                    },
                                })
                            );
                        }
                    } catch (controlError) {
                        console.warn('Failed to add map controls:', controlError);
                    }
                });
            } catch (error) {
                console.error('Failed to initialize AMap:', error);
            }
        };

        // 兼容 tsc 在非 ESNext module 下无法识别 import.meta 的问题，运行时 Vite 会注入 import.meta.env
        // 通过 Vite define 注入或 Electron 预加载提供
        const key =
            (globalThis as any).__VITE_AMAP_KEY__ ||
            (window as any).electronAPI?.getMapConfig?.().amapKey;
        const security = (globalThis as any).__VITE_AMAP_SECURITY_CODE__;

        if (!key) {
            console.warn('AMap key 未配置, 地图将不会显示');
            return;
        }

        loadAmapScript(key, security)
            .then(() => initMap())
            .catch((e) => console.error('加载 AMap 脚本失败:', e));

        return () => {
            if (mapInstance.current) {
                try {
                    mapInstance.current.destroy();
                } catch (error) {
                    console.warn('Failed to destroy map:', error);
                }
            }
        };
    }, []);

    return <div ref={mapRef} className="w-full h-full" />;
};

export default AMapComponent;
