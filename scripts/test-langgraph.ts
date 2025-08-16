#!/usr/bin/env ts-node

/**
 * 独立测试 LangGraph 服务的脚本
 * 用于调试和测试 Node.js 相关代码
 */

import { LangGraphService } from '../src/main/services/langgraph';

async function testLangGraphService() {
    console.log('🚀 开始测试 LangGraph 服务...');
    
    try {
        // 初始化服务
        const service = LangGraphService.getInstance();
        await service.initialize();
        console.log('✅ LangGraph 服务初始化成功');

        // 测试流式消息处理
        console.log('📝 测试流式消息处理...');
        const testMessage = "你好，请简单介绍一下北京的旅游景点";
        
        let fullResponse = '';
        for await (const chunk of service.streamMessage(testMessage, 'test-session')) {
            process.stdout.write(chunk);
            fullResponse += chunk;
        }
        
        console.log('\n\n✅ 测试完成');
        console.log(`📊 总响应长度: ${fullResponse.length} 字符`);
        
    } catch (error) {
        console.error('❌ 测试失败:', error);
        process.exit(1);
    }
}

// 如果直接运行此脚本
if (require.main === module) {
    testLangGraphService()
        .then(() => {
            console.log('🎉 所有测试通过');
            process.exit(0);
        })
        .catch((error) => {
            console.error('💥 测试过程中发生错误:', error);
            process.exit(1);
        });
}

export { testLangGraphService };