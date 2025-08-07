import { useRef, useEffect } from "react";

const AMapComponent: React.FC = () => {
    const mapRef = useRef<HTMLDivElement>(null);
    const mapInstance = useRef<any>(null);

    useEffect(() => {
        const initMap = () => {
            if (!mapRef.current) return;

            // 检查 AMap 是否已加载
            if (!(window as any).AMap) {
                console.error("AMap is not loaded");
                return;
            }

            try {
                // 初始化高德地图
                mapInstance.current = new (window as any).AMap.Map(
                    mapRef.current,
                    {
                        zoom: 4,
                        center: [116.397428, 39.90923], // 北京坐标
                        viewMode: "2D", // 先使用 2D 模式，避免 WebGL 相关错误
                        features: ["bg", "road", "building", "point"],
                    }
                );

                // 等待地图完全加载后再添加控件
                mapInstance.current.on("complete", () => {
                    try {
                        // 添加工具条
                        if ((window as any).AMap.ToolBar) {
                            mapInstance.current.addControl(
                                new (window as any).AMap.ToolBar({
                                    position: {
                                        top: "10px",
                                        right: "10px",
                                    },
                                })
                            );
                        }

                        if ((window as any).AMap.Scale) {
                            mapInstance.current.addControl(
                                new (window as any).AMap.Scale({
                                    position: {
                                        bottom: "10px",
                                        left: "10px",
                                    },
                                })
                            );
                        }
                    } catch (controlError) {
                        console.warn(
                            "Failed to add map controls:",
                            controlError
                        );
                    }
                });
            } catch (error) {
                console.error("Failed to initialize AMap:", error);
            }
        };

        // 如果 AMap 已经加载，直接初始化
        if ((window as any).AMap) {
            initMap();
        } else {
            // 否则等待 AMap 加载完成
            const checkAMap = setInterval(() => {
                if ((window as any).AMap) {
                    clearInterval(checkAMap);
                    initMap();
                }
            }, 100);

            // 10秒后清除检查
            setTimeout(() => clearInterval(checkAMap), 10000);
        }

        return () => {
            if (mapInstance.current) {
                try {
                    mapInstance.current.destroy();
                } catch (error) {
                    console.warn("Failed to destroy map:", error);
                }
            }
        };
    }, []);

    return <div ref={mapRef} className="w-full h-full" />;
};

export default AMapComponent;
