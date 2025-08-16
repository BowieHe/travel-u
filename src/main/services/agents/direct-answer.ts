import { AIMessage, SystemMessage } from '@langchain/core/messages';
import { DeepSeek } from '../models/deepseek';
import { AgentState } from '../utils/agent-type';
import { Gemini } from '../models/gemini';

const DIRECT_PROMPT = `
你是一个万能回答助手，负责直接、简洁、准确地回答用户的简单问题。

规则：
1. 仅回答用户最新输入的问题。
2. 不需要多步骤推理，不涉及复杂任务规划。
3. 语言简洁明了，避免冗余说明。
4. 保持中立、客观，禁止虚构事实。
5. 如果问题含糊，做合理假设并直接给出最佳答案。
6. 允许使用事实、计算、翻译、常识等直接输出结果。

输出格式：
- 使用简洁的 Markdown 格式回答
- 支持粗体、斜体、列表等基本格式
- 如果有数值、日期、时间等信息，保持格式清晰
- 不使用 JSON 或代码块包装
`;

export const createDirectAnswerNode = () => {
    const llm = new DeepSeek();
    const model = llm.llm('deepseek-reasoner'); // 使用普通chat模型以避免思考内容
    // const model = new Gemini().llm('gemini-2.5-pro');

    return async (state: AgentState): Promise<Partial<AgentState>> => {
        const system = new SystemMessage({ content: DIRECT_PROMPT });
        const last = state.messages[state.messages.length - 1];
        console.log('Direct Answer last Message:', last.content);
        const resp = await model.invoke([system, ...state.messages]);

        console.log('Direct Answer Response:', resp);

        return {
            messages: [new AIMessage({ content: resp.content })],
        };
    };
};
